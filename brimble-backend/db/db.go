package db

import (
	"database/sql"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Project struct {
	ID            int       `json:"id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	Env           string    `json:"env"`
	CurrentImage  string    `json:"current_image"`
	ContainerName string    `json:"container_name"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type LogEntry struct {
	ID          int       `json:"id"`
	ProjectSlug string    `json:"project_slug"`
	Log         string    `json:"log"`
	CreatedAt   time.Time `json:"created_at"`
}

type ProjectImage struct {
	ID        int       `json:"id"`
	ProjectID int       `json:"project_id"`
	ImageTag  string    `json:"image_tag"`
	CreatedAt time.Time `json:"created_at"`
}

func GetDatabase() (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "./brimble.db")
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
				status TEXT NOT NULL DEFAULT 'building',
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
				updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS docker_images (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				project_id INTEGER NOT NULL,
				image_tag TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);

			CREATE TABLE IF NOT EXISTS logs (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				project_slug TEXT NOT NULL,
				log TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			);
		`,
	)

	return nil
}

func SaveProject(name, slug, status string) (int64, error) {
	db, err := GetDatabase()
	if err != nil {
		return 0, err
	}
	defer db.Close()

	res, err := db.Exec(
		`INSERT INTO projects (name, slug, status) VALUES (?, ?, ?)`,
		name, slug, status,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func SaveDockerImage(projectID int64, imageTag string) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(
		`INSERT INTO docker_images (project_id, image_tag) VALUES (?, ?)`,
		projectID, imageTag,
	)
	return err
}

func UpdateProject(slug, env, currentImage, containerName, status string) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(
		`UPDATE projects
		 SET env = ?, current_image = ?, container_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP
		 WHERE slug = ?`,
		env, currentImage, containerName, status, slug,
	)
	return err
}

func UpdateProjectStatus(slug, status string) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(
		`UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?`,
		status, slug,
	)
	return err
}

func SaveLogs(projectSlug string, logs []string) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`INSERT INTO logs (project_slug, log) VALUES (?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, line := range logs {
		if _, err := stmt.Exec(projectSlug, line); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

func GetProjects() ([]Project, error) {
	db, err := GetDatabase()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT id, name, slug, COALESCE(env, ''), COALESCE(current_image, ''), COALESCE(container_name, ''), status, created_at, updated_at
		 FROM projects
		 ORDER BY updated_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []Project{}
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Slug, &p.Env, &p.CurrentImage, &p.ContainerName, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func GetProject(slug string) (*Project, error) {
	db, err := GetDatabase()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	row := db.QueryRow(
		`SELECT id, name, slug, COALESCE(env, ''), COALESCE(current_image, ''), COALESCE(container_name, ''), status, created_at, updated_at
		 FROM projects
		 WHERE slug = ?`,
		slug,
	)

	var p Project
	if err := row.Scan(&p.ID, &p.Name, &p.Slug, &p.Env, &p.CurrentImage, &p.ContainerName, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	return &p, nil
}

func GetLogs(projectSlug string) ([]LogEntry, error) {
	db, err := GetDatabase()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT id, project_slug, COALESCE(log, ''), created_at
		 FROM logs
		 WHERE project_slug = ?
		 ORDER BY id ASC`,
		projectSlug,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := []LogEntry{}
	for rows.Next() {
		var l LogEntry
		if err := rows.Scan(&l.ID, &l.ProjectSlug, &l.Log, &l.CreatedAt); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

func GetProjectImageByID(projectID, imageID int64) (*ProjectImage, error) {
	db, err := GetDatabase()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	row := db.QueryRow(
		`SELECT id, project_id, COALESCE(image_tag, ''), created_at
		 FROM docker_images
		 WHERE id = ? AND project_id = ?`,
		imageID, projectID,
	)

	var img ProjectImage
	if err := row.Scan(&img.ID, &img.ProjectID, &img.ImageTag, &img.CreatedAt); err != nil {
		return nil, err
	}
	return &img, nil
}

func HasDockerImage(projectID int64, imageTag string) (bool, error) {
	db, err := GetDatabase()
	if err != nil {
		return false, err
	}
	defer db.Close()

	var count int
	err = db.QueryRow(
		`SELECT COUNT(*) FROM docker_images WHERE project_id = ? AND image_tag = ?`,
		projectID, imageTag,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func GetProjectImages(slug string) ([]ProjectImage, error) {
	db, err := GetDatabase()
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT di.id, di.project_id, COALESCE(di.image_tag, ''), di.created_at
		 FROM docker_images di
		 JOIN projects p ON p.id = di.project_id
		 WHERE p.slug = ?
		 ORDER BY di.created_at DESC`,
		slug,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := []ProjectImage{}
	for rows.Next() {
		var img ProjectImage
		if err := rows.Scan(&img.ID, &img.ProjectID, &img.ImageTag, &img.CreatedAt); err != nil {
			return nil, err
		}
		images = append(images, img)
	}
	return images, rows.Err()
}

func DeleteLogs(slug string) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`DELETE FROM logs WHERE project_slug = ?`, slug)
	return err
}

func DeleteProjectImages(projectID int64) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`DELETE FROM docker_images WHERE project_id = ?`, projectID)
	return err
}

func DeleteProject(slug string) error {
	db, err := GetDatabase()
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(`DELETE FROM projects WHERE slug = ?`, slug)
	return err
}
