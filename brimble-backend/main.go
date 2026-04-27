package main

import (
	"brimble.backend/db"
	"brimble.backend/deployment"
	"github.com/gin-gonic/gin"
)

func init() {
	if err := db.SetupDatabase(); err != nil {
		panic(err)
	}
}

func main() {
	r := gin.Default()

	r.POST("/api/deployment", deployment.CreateDeployment)
	r.POST("/api/deployment/:slug/source", deployment.UpdateDeploymentSource)
	r.POST("/api/deployment/:slug/env", deployment.UpdateDeploymentEnv)
	r.POST("/api/deployment/:slug/rollback", deployment.RollbackDeployment)
	r.GET("/api/deployments", deployment.GetDeployments)
	r.GET("/api/deployment/:slug", deployment.GetDeployment)
	r.GET("/api/deployment/:slug/logs", deployment.GetDeploymentLogs)
	r.GET("/api/deployment/:slug/status", deployment.GetDeploymentStatus)
	r.GET("/api/deployment/:slug/images", deployment.GetDeploymentImages)
	r.Run(":3000")
}
