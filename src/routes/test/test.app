{
  "name": "test",
  "version": "0.2",
  "docker_image": "girish/test:0.2",
  "home_url": "/",
  "health_check_url": "/",
  "http_port": 7777,
  "tcp_ports": {
    "7778": {
      "description": "Echo server",
      "environment_variable": "ECHO_SERVER_PORT"
    }
  },
  "suggested_locations": [
    "ngircd",
    "irc"
  ]
}
