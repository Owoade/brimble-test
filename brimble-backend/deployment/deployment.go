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
	"strings"
	"time"

	"brimble.backend/utils"
	"github.com/gin-gonic/gin"
)

func CreateDeployment(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	var body CreateDeploymentPayload
	if err := c.ShouldBind(&body); err != nil {
		message := map[string]any{
			"status":  false,
			"message": err.Error(),
		}
		messageToJSON, _ := json.Marshal(message)
		c.SSEvent("message", messageToJSON)
		return
	}

	slug := fmt.Sprintf("%s-%d", utils.Slugify(body.Name), time.Now().UnixMilli())
	destination := filepath.Join("apps", slug)

	if body.Type == "zip-upload" {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			message := map[string]any{
				"status":  false,
				"message": err.Error(),
			}
			messageToJSON, _ := json.Marshal(message)
			c.SSEvent("message", messageToJSON)
			return
		}

		if err := isZipFile(fileHeader); err != nil {
			message := map[string]any{
				"status":  false,
				"message": "Invalid zip file",
			}
			messageToJSON, _ := json.Marshal(message)
			c.SSEvent("message", messageToJSON)
			return
		}

		topLevelDirectories, err := unzipFileFromMultipartFile(fileHeader, destination)
		if len(topLevelDirectories) != 1 {
			os.RemoveAll(destination)
			message := map[string]any{
				"status":  false,
				"message": "Zip yielded more than one folder",
			}
			messageToJSON, _ := json.Marshal(message)
			c.SSEvent("message", messageToJSON)
			return
		}

		destination = filepath.Join(destination, topLevelDirectories[0])
		home, _ := os.UserHomeDir()

		cmd := exec.Command(
			"railpack",
			"build",
			filepath.Join(home, "app", destination),
			"--name",
			"railpack-api-image",
		)

		

	}
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

func execCommandAndStreamViaSSE(c *exec.Cmd, gc *gin.Context) {
	stdout, _ := c.StdoutPipe()
	stderr, _ := c.StderrPipe()

	logChan := make(chan string)
	done := make(chan bool)

	_ = c.Start()

	// read stdout
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			logChan <- scanner.Text()
		}
	}()

	// read stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			logChan <- scanner.Text()
		}
	}()

	// wait for command
	go func() {
		c.Wait()
		done <- true
	}()

	// SSE loop
	for {
		select {
		case line := <-logChan:
			// fmt.Fprintf(c.Writer, "data: %s\n\n", line)
			// flusher.Flush()
			gc.SSEvent("message", fmt.Sprintf("data: %s\n\n", line))

		case <-done:
			gc.SSEvent("message", "data: BUILD FINISHED\n\n")
			return

		case <-gc.Request.Context().Done():
			return
		}
	}

}
