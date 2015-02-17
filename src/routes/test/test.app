{
  "title": "test",
  "version": "0.0.8",
  "dockerImage": "girish/test:0.8",
  "healthCheckPath": "/",
  "httpPort": "7777",
  "tcpPorts": {
    "7778": {
      "description": "Echo server",
      "environmentVariable": "ECHO_SERVER_PORT"
    }
  },
  "addons": [
    "oauth",
    "redis",
    "mysql",
    "postgresql"
  ]
}
