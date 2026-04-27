package deployment

import (
	"database/sql"
	"fmt"
	"net/http"
	"os/exec"
	"strings"

	"brimble.backend/db"
	"github.com/gin-gonic/gin"
)

func GetDeployments(c *gin.Context) {
	projects, err := db.GetProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"status": true,
		"data":   projects,
	})
}

func GetDeployment(c *gin.Context) {
	slug := c.Param("slug")

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

	c.JSON(http.StatusOK, map[string]any{
		"status": true,
		"data":   project,
	})
}

func GetDeploymentLogs(c *gin.Context) {
	slug := c.Param("slug")

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

	if project.Status == "building" {
		c.JSON(http.StatusOK, map[string]any{
			"status": true,
			"data":   getLiveLogs(slug),
		})
		return
	}

	entries, err := db.GetLogs(slug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	logs := make([]string, len(entries))
	for i, e := range entries {
		logs[i] = e.Log
	}

	c.JSON(http.StatusOK, map[string]any{
		"status": true,
		"data":   logs,
	})
}

func GetDeploymentStatus(c *gin.Context) {
	slug := c.Param("slug")

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

	container, err := getDockerContainer(project.ContainerName)
	if err != nil {
		c.JSON(http.StatusNotFound, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"status": true,
		"data":   container.State,
	})
}

func GetDeploymentImages(c *gin.Context) {
	slug := c.Param("slug")

	images, err := db.GetProjectImages(slug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"status": true,
		"data":   images,
	})
}

func GetDeploymentRuntimeLogs(c *gin.Context) {
	slug := c.Param("slug")

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

	if project.ContainerName == "" {
		c.JSON(http.StatusBadRequest, map[string]any{
			"status":  false,
			"message": "Deployment has no running container",
		})
		return
	}

	cmd := exec.Command("docker", "logs", project.ContainerName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": fmt.Sprintf("docker logs %s: %s: %s", project.ContainerName, err.Error(), string(output)),
		})
		return
	}

	logs := strings.Split(strings.TrimRight(string(output), "\n"), "\n")
	if len(logs) == 1 && logs[0] == "" {
		logs = []string{}
	}

	c.JSON(http.StatusOK, map[string]any{
		"status": true,
		"data":   logs,
	})
}
