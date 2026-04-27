package main

import (
	"time"

	"brimble.backend/db"
	"brimble.backend/deployment"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func init() {
	if err := db.SetupDatabase(); err != nil {
		panic(err)
	}
}

func main() {
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Authorization", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	r.POST("/api/deployment", deployment.CreateDeployment)
	r.POST("/api/deployment/:slug/source", deployment.UpdateDeploymentSource)
	r.POST("/api/deployment/:slug/env", deployment.UpdateDeploymentEnv)
	r.POST("/api/deployment/:slug/rollback", deployment.RollbackDeployment)
	r.GET("/api/deployments", deployment.GetDeployments)
	r.GET("/api/deployment/:slug", deployment.GetDeployment)
	r.GET("/api/deployment/:slug/logs", deployment.GetDeploymentLogs)
	r.GET("/api/deployment/:slug/runtime-logs", deployment.GetDeploymentRuntimeLogs)
	r.GET("/api/deployment/:slug/status", deployment.GetDeploymentStatus)
	r.GET("/api/deployment/:slug/images", deployment.GetDeploymentImages)
	r.DELETE("/api/deployment/:slug", deployment.DeleteDeployment)
	r.Run(":3000")
}
