package config

type GlobalConfigType struct {
	CaddyContainerName   string
	DeploymentFolderName string
	DockerNetworkName    string
	ProjectName          string
}

var Global = GlobalConfigType{
	ProjectName:          "owoade_brimble",
	CaddyContainerName:   "owoade_brimble_caddy",
	DeploymentFolderName: "apps",
	DockerNetworkName:    "owoade_brimble_web",
}
