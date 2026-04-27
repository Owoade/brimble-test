package deployment

import (
	"database/sql"
	"net/http"

	"brimble.backend/db"
	"github.com/gin-gonic/gin"
)

func DeleteDeployment(c *gin.Context) {
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

	if err := stopAndRemoveContainer(project.ContainerName); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	archived, err := db.GetProjectImages(slug)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	tags := []string{}
	if project.CurrentImage != "" {
		tags = append(tags, project.CurrentImage)
	}
	for _, img := range archived {
		tags = append(tags, img.ImageTag)
	}

	for _, tag := range tags {
		if err := removeDockerImage(tag); err != nil {
			c.JSON(http.StatusInternalServerError, map[string]any{
				"status":  false,
				"message": err.Error(),
			})
			return
		}
	}

	if err := db.DeleteLogs(slug); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	if err := db.DeleteProjectImages(int64(project.ID)); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	if err := db.DeleteProject(slug); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"status":  false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"status":  true,
		"message": "Deployment deleted",
	})
}
