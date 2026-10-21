// Startup file for cPanel "Setup Node.js App" (Phusion Passenger). Passenger loads it with
// require(), and the API is an ES module, so this wrapper imports the built entry point.
import("./dist/index.js").catch((error) => {
  console.error("Failed to load dist/index.js. Did you upload the built dist/ folder?", error);
  process.exit(1);
});
