{
  "title": "test",
  "version": "0.3",
  "dockerImage": "girish/test:0.3",
  "healthCheckPath": "/",
  "httpPort": "7777",
  "tcpPorts": {
    "7778": {
      "description": "Echo server",
      "environmentVariable": "ECHO_SERVER_PORT"
    }
  }
}
