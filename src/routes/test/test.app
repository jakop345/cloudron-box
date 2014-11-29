{
  "title": "test",
  "version": "0.6",
  "dockerImage": "girish/test:0.6",
  "healthCheckPath": "/",
  "httpPort": "7777",
  "tcpPorts": {
    "7778": {
      "description": "Echo server",
      "environmentVariable": "ECHO_SERVER_PORT"
    }
  },
  "addons": [
    "oauth"
  ]
}
