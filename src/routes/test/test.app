{
  "title": "test",
  "version": "0.5",
  "dockerImage": "girish/test:0.5",
  "healthCheckPath": "/",
  "httpPort": "7777",
  "tcpPorts": {
    "7778": {
      "description": "Echo server",
      "environmentVariable": "ECHO_SERVER_PORT"
    }
  }
}
