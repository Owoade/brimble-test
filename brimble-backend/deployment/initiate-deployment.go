package deployment

import (
	"archive/zip"
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"brimble.backend/config"
	"brimble.backend/db"
	"brimble.backend/utils"
	"github.com/gin-gonic/gin"
)

var (
	liveLogs   = make(map[string][]string)
	liveLogsMu sync.RWMutex
)

func getLiveLogs(slug string) []string {
	liveLogsMu.RLock()
	defer liveLogsMu.RUnlock()
	src := liveLogs[slug]
	out := make([]string, len(src))
	copy(out, src)
	return out
}

func CreateDeployment(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	var allowedType = []string{"github", "zip-upload"}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": "SSE not supported",
		})
		return
	}

	var slug string
	accumulatedLogs := []string{}
	emit := func(level, msg string) {
		parts := []string{strconv.Itoa(int(time.Now().UnixMilli())), level, msg}
		line := strings.Join(parts, config.Global.LogParamSeparator)
		accumulatedLogs = append(accumulatedLogs, line)
		if slug != "" {
			liveLogsMu.Lock()
			liveLogs[slug] = accumulatedLogs
			liveLogsMu.Unlock()
		}
		fmt.Fprintf(c.Writer, "data: %s\n\n", line)
		flusher.Flush()
	}

	var body CreateDeploymentPayload
	if err := c.ShouldBind(&body); err != nil {
		emit("ERROR", err.Error())
		return
	}

	if !slices.Contains(allowedType, body.Type) {
		emit("ERROR", "Invalid `type` value")
		return
	}

	deployTs := time.Now().UnixMilli()
	slug = fmt.Sprintf("%s-%d", utils.Slugify(body.Name), deployTs)
	imageName := fmt.Sprintf("%s_%s_%d", config.Global.ProjectName, slug, deployTs)
	containerName := fmt.Sprintf("%s_%d", slug, deployTs)
	destination := filepath.Join(config.Global.DeploymentFolderName, imageName)

	deployed := false
	defer func() {
		if !deployed {
			db.UpdateProjectStatus(slug, "failed")
		}
		if err := db.SaveLogs(slug, accumulatedLogs); err != nil {
			fmt.Fprintf(c.Writer, "data: %s\n\n", strings.Join(
				[]string{strconv.Itoa(int(time.Now().UnixMilli())), "ERROR", fmt.Sprintf("%s:%s", "Failed to save logs", err.Error())},
				config.Global.LogParamSeparator,
			))
			flusher.Flush()
		} else {
			liveLogsMu.Lock()
			delete(liveLogs, slug)
			liveLogsMu.Unlock()
		}
	}()

	finalDest, ok := acquireSource(c, &body, destination, emit)
	if !ok {
		return
	}

	if _, err := db.SaveProject(body.Name, slug, "building"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to save project", err.Error()))
		return
	}

	if !buildImage(c, finalDest, imageName, emit) {
		return
	}

	envPath, err := writeEnvFile(finalDest, body.Env)
	if err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Error saving .env to destination", err.Error()))
		return
	}

	if !runContainer(c, containerName, imageName, envPath, emit) {
		return
	}

	emit("CADDY", "Registering route with Caddy...")

	if err := registerWithCaddy(slug, containerName); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to register with Caddy", err.Error()))
		return
	}

	url := fmt.Sprintf("http://%s.localhost/", slug)
	emit("SUCCESS", url)

	if err := db.UpdateProject(slug, body.Env, imageName, containerName, "running"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update project", err.Error()))
		return
	}
	deployed = true
}

func isZipFile(file *multipart.FileHeader) error {
	if filepath.Ext(file.Filename) != ".zip" {
		return errors.New("file extension is not .zip")
	}

	f, err := file.Open()
	if err != nil {
		return err
	}
	defer f.Close()

	buffer := make([]byte, 512)
	n, err := f.Read(buffer)
	if err != nil {
		return err
	}
	buffer = buffer[:n]

	contentType := http.DetectContentType(buffer)
	if contentType != "application/zip" && contentType != "application/octet-stream" {
		return errors.New("invalid file type, not a zip")
	}

	if len(buffer) < 2 || buffer[0] != 'P' || buffer[1] != 'K' {
		return errors.New("invalid zip signature")
	}
	return nil
}

func unzipFileFromMultipartFile(fh *multipart.FileHeader, dest string) (clientFolders []string, err error) {
	f, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()

	buf, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}

	r := bytes.NewReader(buf)
	zr, err := zip.NewReader(r, int64(len(buf)))
	if err != nil {
		return nil, err
	}

	topLevelDirectories := []string{}

	for _, f := range zr.File {
		outPath := filepath.Join(dest, f.Name)

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(outPath, f.Mode()); err != nil {
				return nil, err
			}

			if len(topLevelDirectories) == 0 {
				topLevelDirectories = append(topLevelDirectories, strings.Split(f.Name, string(filepath.Separator))[0])
			} else {
				lastDir := topLevelDirectories[len(topLevelDirectories)-1]
				if !isSubPath(lastDir, f.Name) {
					topLevelDirectories = append(topLevelDirectories, f.Name)
				}
			}
		} else {
			newFile, _ := os.Create(outPath)

			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()

			io.Copy(newFile, rc)
		}
	}

	return topLevelDirectories, nil
}

func isSubPath(base, target string) bool {
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false
	}

	return !strings.HasPrefix(rel, "..")

}

func execCommandAndStreamViaSSE(c *exec.Cmd, gc *gin.Context, emit func(level, msg string)) {
	if _, ok := gc.Writer.(http.Flusher); !ok {
		return
	}

	println("sse function")
	stdout, _ := c.StdoutPipe()
	stderr, _ := c.StderrPipe()

	logChan := make(chan string)
	done := make(chan bool)

	_ = c.Start()

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			logChan <- scanner.Text()
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			fmt.Println("LOGS >>", scanner.Text())
			logChan <- scanner.Text()
		}
	}()

	go func() {
		c.Wait()
		done <- true
	}()

	for {
		select {
		case line := <-logChan:
			emit("BUILD", line)

		case <-done:
			emit("BUILD", "BULD finished.")
			return

		case <-gc.Request.Context().Done():
			return
		}
	}

}

func getDockerImage(imageName string) (di *DockerImage, err error) {
	cmd := exec.Command("docker", "image", "inspect", imageName)

	output, err := cmd.Output()

	if err != nil {
		return nil, fmt.Errorf("failed to inspect image: %w", err)
	}

	var result []DockerImage
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	if len(result) == 0 {
		return nil, fmt.Errorf("no image data found")
	}

	return &result[0], nil
}

func injectPort(env string, port int) string {
	lines := strings.Split(env, "\n")

	found := false
	for i, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "PORT=") {
			lines[i] = fmt.Sprintf("PORT=%d", port)
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, fmt.Sprintf("PORT=%d", port))
	}

	return strings.Join(lines, "\n")
}

func parseGitHubURL(raw string) (*GitRepo, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimSuffix(raw, ".git")

	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")

	if strings.HasPrefix(raw, "git@") {
		parts := strings.Split(raw, ":")
		if len(parts) != 2 {
			return nil, errors.New("invalid ssh git url")
		}
		raw = parts[1]
	}

	raw = strings.TrimPrefix(raw, "github.com/")
	raw = strings.TrimPrefix(raw, "www.github.com/")

	parts := strings.Split(raw, "/")
	if len(parts) != 2 {
		return nil, errors.New("invalid repo format")
	}
	return &GitRepo{
		Owner: parts[0],
		Name:  parts[1],
	}, nil

}

func pullFromGithub(p GitRepo, destination string) (td []string, err error) {

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/zipball", p.Owner, p.Name)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		var response map[string]string
		json.NewDecoder(resp.Body).Decode(&response)
		return nil, fmt.Errorf("Github error: %s", response["message"])
	}

	var buf bytes.Buffer
	size, err := io.Copy(&buf, resp.Body)
	if err != nil {
		return nil, err
	}

	r, err := zip.NewReader(bytes.NewReader(buf.Bytes()), size)
	if err != nil {
		return nil, err
	}

	topLevelDirectories := []string{}
	for _, f := range r.File {
		fpath := filepath.Join(destination, f.Name)

		if !strings.HasPrefix(fpath, filepath.Clean(destination)+string(os.PathSeparator)) {
			return nil, fmt.Errorf("illegal file path: %s", fpath)
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, os.ModePerm)
			if len(topLevelDirectories) == 0 {
				topLevelDirectories = append(topLevelDirectories, strings.Split(f.Name, string(filepath.Separator))[0])
			} else {
				lastDir := topLevelDirectories[len(topLevelDirectories)-1]
				if !isSubPath(lastDir, f.Name) {
					topLevelDirectories = append(topLevelDirectories, f.Name)
				}
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return nil, err
		}

		inFile, err := f.Open()
		if err != nil {
			return nil, err
		}

		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			inFile.Close()
			return nil, err
		}

		_, err = io.Copy(outFile, inFile)
		inFile.Close()
		outFile.Close()
		if err != nil {
			return nil, err
		}
	}

	return topLevelDirectories, nil
}

func getDockerContainer(name string) (*DockerContainer, error) {

	cmd := exec.Command("docker", "inspect", name)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to inspect container: %w", err)
	}
	var containers []DockerContainer
	if err := json.Unmarshal(output, &containers); err != nil {
		return nil, fmt.Errorf("failed to parse docker inspect output: %w", err)
	}
	if len(containers) == 0 {
		return nil, fmt.Errorf("no container found")
	}
	return &containers[0], nil

}

func registerWithCaddy(host, container string) error {
	route := map[string]any{
		"@id": fmt.Sprintf("deploy_%s", host),
		"match": []map[string]any{
			{"host": []string{fmt.Sprintf("%s.localhost", host)}},
		},
		"handle": []map[string]any{
			{
				"handler": "reverse_proxy",
				"upstreams": []map[string]any{
					{"dial": fmt.Sprintf("%s:3000", container)},
				},
			},
		},
	}

	body, err := json.Marshal(route)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("http://%s:2019/config/apps/http/servers/net/routes/0", config.Global.CaddyContainerName)
	req, err := http.NewRequest("PUT", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("caddy returned status %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}
