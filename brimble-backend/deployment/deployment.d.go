package deployment

type CreateDeploymentPayload struct {
	Name       string `form:"name" binding:"required"`
	Env        string `form:"env"`
	Type       string `form:"type" binding:"required oneof=zip-upload github"`
	GithubLink string `form:"github_link"`
}
