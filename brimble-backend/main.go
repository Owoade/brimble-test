package main

import (
	"brimble.backend/db"
	"github.com/gin-gonic/gin"
)

func init() {
	if err := db.SetupDatabase(); err != nil {
		panic(err)
	}
}

func main() {
	r := gin.Default()
	
	r.Run(":5000")
}
