package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	// Handle root route
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "Hello from a simple Go HTTP server!")
	})

	// Handle health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "OK")
	})

	port := ":4300"
	log.Println("Server running on http://localhost" + port)

	// Start server
	log.Fatal(http.ListenAndServe(port, nil))
}
