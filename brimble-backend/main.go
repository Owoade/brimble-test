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

	r.POST("/deployment", deployment.CreateDeployment)
	r.Run(":3000")
}
