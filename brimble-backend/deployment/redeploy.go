package deployment

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"brimble.backend/config"
	"brimble.backend/db"
	"github.com/gin-gonic/gin"
)

func UpdateDeploymentSource(c *gin.Context) {
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

	slug := c.Param("slug")
	accumulatedLogs := []string{}
	emit := func(level, msg string) {
		parts := []string{strconv.Itoa(int(time.Now().UnixMilli())), level, msg}
		line := strings.Join(parts, config.Global.LogParamSeparator)
		accumulatedLogs = append(accumulatedLogs, line)
		liveLogsMu.Lock()
		liveLogs[slug] = accumulatedLogs
		liveLogsMu.Unlock()
		fmt.Fprintf(c.Writer, "data: %s\n\n", line)
		flusher.Flush()
	}

	project, err := db.GetProject(slug)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]any{
				"status":  false,
				"message": "Deployment not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
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

	if err := db.UpdateProjectStatus(slug, "building"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to set status", err.Error()))
		return
	}

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

	deployTs := time.Now().UnixMilli()
	newImage := fmt.Sprintf("%s_%s_%d", config.Global.ProjectName, slug, deployTs)
	newContainer := fmt.Sprintf("%s_%d", slug, deployTs)
	destination := filepath.Join(config.Global.DeploymentFolderName, newImage)

	finalDest, ok := acquireSource(c, &body, destination, emit)
	if !ok {
		return
	}

	if !buildImage(c, finalDest, newImage, emit) {
		return
	}

	envPath, err := writeEnvFile(finalDest, project.Env)
	if err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Error saving .env to destination", err.Error()))
		return
	}

	if !runContainer(c, newContainer, newImage, envPath, emit) {
		return
	}

	emit("CADDY", "Updating Caddy route...")
	if err := updateCaddyRoute(slug, newContainer); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update Caddy", err.Error()))
		return
	}

	if err := stopAndRemoveContainer(project.ContainerName); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to remove old container", err.Error()))
		return
	}

	if project.CurrentImage != "" {
		if err := db.SaveDockerImage(int64(project.ID), project.CurrentImage); err != nil {
			emit("ERROR", fmt.Sprintf("%s:%s", "Failed to archive previous image", err.Error()))
			return
		}
	}

	if err := db.UpdateProject(slug, project.Env, newImage, newContainer, "running"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update project", err.Error()))
		return
	}

	if project.CurrentImage != "" {
		oldDir := filepath.Join(config.Global.DeploymentFolderName, project.CurrentImage)
		if err := os.RemoveAll(oldDir); err != nil {
			emit("WARN", fmt.Sprintf("%s:%s", "Failed to remove old source folder", err.Error()))
		}
	}

	url := fmt.Sprintf("http://%s.localhost/", slug)
	emit("SUCCESS", url)
	deployed = true
}

func UpdateDeploymentEnv(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": "SSE not supported",
		})
		return
	}

	slug := c.Param("slug")
	accumulatedLogs := []string{}
	emit := func(level, msg string) {
		parts := []string{strconv.Itoa(int(time.Now().UnixMilli())), level, msg}
		line := strings.Join(parts, config.Global.LogParamSeparator)
		accumulatedLogs = append(accumulatedLogs, line)
		liveLogsMu.Lock()
		liveLogs[slug] = accumulatedLogs
		liveLogsMu.Unlock()
		fmt.Fprintf(c.Writer, "data: %s\n\n", line)
		flusher.Flush()
	}

	project, err := db.GetProject(slug)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]any{
				"status":  false,
				"message": "Deployment not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	var body UpdateEnvPayload
	if err := c.ShouldBindJSON(&body); err != nil {
		emit("ERROR", err.Error())
		return
	}

	if project.CurrentImage == "" {
		emit("ERROR", "Project has no current image")
		return
	}

	if err := db.UpdateProjectStatus(slug, "building"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to set status", err.Error()))
		return
	}

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

	deployTs := time.Now().UnixMilli()
	newContainer := fmt.Sprintf("%s_%d", slug, deployTs)
	envDir := filepath.Join(config.Global.DeploymentFolderName, project.CurrentImage)

	envPath, err := writeEnvFile(envDir, body.Env)
	if err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Error saving .env to destination", err.Error()))
		return
	}

	if !runContainer(c, newContainer, project.CurrentImage, envPath, emit) {
		return
	}

	emit("CADDY", "Updating Caddy route...")
	if err := updateCaddyRoute(slug, newContainer); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update Caddy", err.Error()))
		return
	}

	if err := stopAndRemoveContainer(project.ContainerName); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to remove old container", err.Error()))
		return
	}

	if err := db.UpdateProject(slug, body.Env, project.CurrentImage, newContainer, "running"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update project", err.Error()))
		return
	}

	url := fmt.Sprintf("http://%s.localhost/", slug)
	emit("SUCCESS", url)
	deployed = true
}

func RollbackDeployment(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": "SSE not supported",
		})
		return
	}

	slug := c.Param("slug")
	accumulatedLogs := []string{}
	emit := func(level, msg string) {
		parts := []string{strconv.Itoa(int(time.Now().UnixMilli())), level, msg}
		line := strings.Join(parts, config.Global.LogParamSeparator)
		accumulatedLogs = append(accumulatedLogs, line)
		liveLogsMu.Lock()
		liveLogs[slug] = accumulatedLogs
		liveLogsMu.Unlock()
		fmt.Fprintf(c.Writer, "data: %s\n\n", line)
		flusher.Flush()
	}

	project, err := db.GetProject(slug)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, map[string]any{
				"status":  false,
				"message": "Deployment not found",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	var body RollbackPayload
	if err := c.ShouldBindJSON(&body); err != nil {
		emit("ERROR", err.Error())
		return
	}

	target, err := db.GetProjectImageByID(int64(project.ID), body.ImageID)
	if err != nil {
		if err == sql.ErrNoRows {
			emit("ERROR", "Target image not found for this project")
			return
		}
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to load target image", err.Error()))
		return
	}

	if target.ImageTag == "" {
		emit("ERROR", "Target image has no tag")
		return
	}

	if err := db.UpdateProjectStatus(slug, "building"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to set status", err.Error()))
		return
	}

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

	deployTs := time.Now().UnixMilli()
	newContainer := fmt.Sprintf("%s_%d", slug, deployTs)
	envDir := filepath.Join(config.Global.DeploymentFolderName, target.ImageTag)

	envPath, err := writeEnvFile(envDir, project.Env)
	if err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Error saving .env to destination", err.Error()))
		return
	}

	if !runContainer(c, newContainer, target.ImageTag, envPath, emit) {
		return
	}

	emit("CADDY", "Updating Caddy route...")
	if err := updateCaddyRoute(slug, newContainer); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update Caddy", err.Error()))
		return
	}

	if err := stopAndRemoveContainer(project.ContainerName); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to remove old container", err.Error()))
		return
	}

	if project.CurrentImage != "" {
		exists, err := db.HasDockerImage(int64(project.ID), project.CurrentImage)
		if err != nil {
			emit("ERROR", fmt.Sprintf("%s:%s", "Failed to check existing image", err.Error()))
			return
		}
		if !exists {
			if err := db.SaveDockerImage(int64(project.ID), project.CurrentImage); err != nil {
				emit("ERROR", fmt.Sprintf("%s:%s", "Failed to archive previous image", err.Error()))
				return
			}
		}
	}

	if err := db.UpdateProject(slug, project.Env, target.ImageTag, newContainer, "running"); err != nil {
		emit("ERROR", fmt.Sprintf("%s:%s", "Failed to update project", err.Error()))
		return
	}

	url := fmt.Sprintf("http://%s.localhost/", slug)
	emit("SUCCESS", url)
	deployed = true
}
