const requiredEnvVars = ["GEMINI_API_KEY"]

requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required env variable: ${key}`)
    process.exit(1)
  }
})

module.exports = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/mockapi",
  PORT: process.env.PORT || 4000,
}