package deployment

type CreateDeploymentPayload struct {
	Name       string `form:"name" binding:"required"`
	Env        string `form:"env"`
	Type       string `form:"type" binding:"required"`
	GithubLink string `form:"github_link"`
}

type DockerImage struct {
	ID       string   `json:"Id"`
	RepoTags []string `json:"RepoTags"`
	Config   struct {
		Env          []string            `json:"Env"`
		Cmd          []string            `json:"Cmd"`
		Entrypoint   []string            `json:"Entrypoint"`
		WorkingDir   string              `json:"WorkingDir"`
		ExposedPorts map[string]struct{} `json:"ExposedPorts"`
	} `json:"Config"`
}

type GitRepo struct {
	Owner string
	Name  string
}
