function detectServiceType(description) {

  const text = description.toLowerCase();

  // Plumbing
  if (
    text.includes("leak") ||
    text.includes("pipe") ||
    text.includes("tap") ||
    text.includes("sink") ||
    text.includes("nala") ||
    text.includes("pani") ||
    text.includes("paani") ||
    text.includes("pipe toot") ||
    text.includes("leaking")
  ) {
    return "plumbing";
  }

  // Electrical
  if (
    text.includes("fan") ||
    text.includes("switch") ||
    text.includes("light") ||
    text.includes("wire") ||
    text.includes("bijli") ||
    text.includes("current") ||
    text.includes("bulb")
  ) {
    return "electrical";
  }

  // AC Repair
  if (
    text.includes("ac") ||
    text.includes("cooling") ||
    text.includes("air conditioner") ||
    text.includes("thanda nahi")
  ) {
    return "ac_repair";
  }

  // Cleaning
  if (
    text.includes("clean") ||
    text.includes("ganda") ||
    text.includes("dust") ||
    text.includes("safai")
  ) {
    return "cleaning";
  }

  return "general";
}

module.exports = { detectServiceType };