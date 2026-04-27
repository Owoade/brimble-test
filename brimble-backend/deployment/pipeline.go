package deployment

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"brimble.backend/config"
	"github.com/gin-gonic/gin"
)

// acquireSource fetches the source for a deployment (zip upload or github)
// into destination and returns the resolved project root. Errors are emitted
// internally; ok=false on failure.
func acquireSource(c *gin.Context, body *CreateDeploymentPayload, destination string, emit func(level, msg string)) (string, bool) {
	if body.Type == "zip-upload" {
		fileHeader, err := c.FormFile("file")
		if err != nil {
			emit("ERROR", fmt.Sprintf("%s:%s", "Error uploading zip file", err.Error()))
			return "", false
		}

		if err := isZipFile(fileHeader); err != nil {
			emit("ERROR", "Invalid zip file")
			return "", false
		}

		topLevelDirectories, err := unzipFileFromMultipartFile(fileHeader, destination)
		if err != nil {
			emit("ERROR", fmt.Sprintf("%s:%s", "Error unzipping file", err.Error()))
			return "", false
		}

		if len(topLevelDirectories) != 1 {
			os.RemoveAll(destination)
			emit("ERROR", "Zip yielded more than one folder")
			return "", false
		}

		return filepath.Join(destination, topLevelDirectories[0]), true
	}

	if body.GithubLink == "" {
		emit("ERROR", "Github link not provided")
		return "", false
	}

	repo, err := parseGitHubURL(body.GithubLink)
	if err != nil {
		emit("ERROR", "Invalid github link")
		return "", false
	}

	topLevelDirectories, err := pullFromGithub(*repo, destination)
	if err != nil {
		os.RemoveAll(destination)
		emit("ERROR", fmt.Sprintf("%s:%s", "Error pulling github repo", err.Error()))
		return "", false
	}

	if len(topLevelDirectories) != 1 {
		os.RemoveAll(destination)
		emit("ERROR", "Zip yielded more than one folder")
		return "", false
	}

	return filepath.Join(destination, topLevelDirectories[0]), true
}

// buildImage runs `railpack build` on destination, tagging with imageRef,
// streams logs via SSE, and verifies the resulting image exists.
func buildImage(c *gin.Context, destination, imageRef string, emit func(level, msg string)) bool {
	cmd := exec.Command(
		"railpack",
		"build",
		destination,
		"--name",
		imageRef,
		"--verbose",
	)

	execCommandAndStreamViaSSE(cmd, c, emit)

	if _, err := getDockerImage(imageRef); err != nil {
		emit("ERROR", "Docker image build failed")
		return false
	}
	return true
}

// writeEnvFile injects PORT=3000 and writes destination/.env. Returns the
// absolute env path.
func writeEnvFile(destination, env string) (string, error) {
	if err := os.MkdirAll(destination, 0755); err != nil {
		return "", err
	}
	merged := injectPort(env, 3000)
	envPath := filepath.Join(destination, ".env")
	if err := os.WriteFile(envPath, []byte(merged), 0644); err != nil {
		return "", err
	}
	return envPath, nil
}

// runContainer starts a detached container with the given name from imageRef
// on the configured docker network, with the env-file applied. Verifies the
// container exists after start.
func runContainer(c *gin.Context, containerName, imageRef, envPath string, emit func(level, msg string)) bool {
	cmd := exec.Command(
		"docker", "run",
		"-d",
		"--name", containerName,
		"--network", config.Global.DockerNetworkName,
		"--env-file", envPath,
		imageRef,
	)

	execCommandAndStreamViaSSE(cmd, c, emit)

	if _, err := getDockerContainer(containerName); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Unable to run docker container", err.Error()))
		return false
	}
	return true
}

// stopAndRemoveContainer force-removes a container by name. Missing containers
// are not treated as errors.
func stopAndRemoveContainer(name string) error {
	if name == "" {
		return nil
	}
	cmd := exec.Command("docker", "rm", "-f", name)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("docker rm -f %s: %w: %s", name, err, string(out))
	}
	return nil
}

// updateCaddyRoute patches the dial address of an existing route registered
// with @id=deploy_<slug> to point at <container>:3000.
func updateCaddyRoute(slug, container string) error {
	url := fmt.Sprintf("http://%s:2019/id/deploy_%s/handle/0/upstreams/0/dial", config.Global.CaddyContainerName, slug)
	dial, err := json.Marshal(fmt.Sprintf("%s:3000", container))
	if err != nil {
		return err
	}

	req, err := http.NewRequest("PATCH", url, bytes.NewReader(dial))
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
