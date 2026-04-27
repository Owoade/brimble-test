package deployment

import (
	"database/sql"
	"net/http"

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
