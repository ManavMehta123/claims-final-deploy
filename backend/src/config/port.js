function getPortCandidates(primaryPort, fallbackPorts = []) {
  const ports = [primaryPort, ...fallbackPorts];
  return ports.filter((port, index) => ports.indexOf(port) === index);
}

module.exports = {
  getPortCandidates,
};
