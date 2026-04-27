package deployment

type CreateDeploymentPayload struct {
	Name       string `form:"name"`
	Env        string `form:"env"`
	Type       string `form:"type" binding:"required"`
	GithubLink string `form:"github_link"`
}

type UpdateDeploymentSourcePayload struct {
	Type       string `form:"type" binding:"required"`
	GithubLink string `form:"github_link"`
}

type UpdateEnvPayload struct {
	Env string `json:"env"`
}

type RollbackPayload struct {
	ImageID int64 `json:"image_id" binding:"required"`
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

type DockerContainer struct {
	ID    string `json:"Id"`
	Name  string `json:"Name"`
	Image string `json:"Image"`
	State struct {
		Status  string `json:"Status"`
		Running bool   `json:"Running"`
		Pid     int    `json:"Pid"`
	} `json:"State"`
	NetworkSettings struct {
		Networks map[string]struct {
			IPAddress string `json:"IPAddress"`
		} `json:"Networks"`
	} `json:"NetworkSettings"`
}

type GitRepo struct {
	Owner string
	Name  string
}
