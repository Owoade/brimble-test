package config

type GlobalConfigType struct {
	CaddyContainerName   string
	DeploymentFolderName string
	DockerNetworkName    string
	ProjectName          string
	LogParamSeparator    string
}

var Global = GlobalConfigType{
	ProjectName:          "owoade_brimble",
	CaddyContainerName:   "caddy",
	DeploymentFolderName: "apps",
	DockerNetworkName:    "owoade_brimble_net",
	LogParamSeparator:    "[owoade_brimble_log_separator]",
}
