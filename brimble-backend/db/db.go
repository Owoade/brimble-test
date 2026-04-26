package db

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

func GetDatabase() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "./infracon.db")
	if err != nil {
		return nil, err
	}
	return db, nil
}

func SetupDatabase() error {
	db, err := GetDatabase()

	if err != nil {
		return err
	}

	db.Exec(
		`
			CREATE TABLE IF NOT EXISTS projects (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				slug TEXT NOT NULL UNIQUE,
				env TEXT,
				current_image TEXT,
				container_name TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE docker_images (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				project_id INTEGER NOT NULL,
				image_tag TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			)
		`,
	)

	return nil
}
