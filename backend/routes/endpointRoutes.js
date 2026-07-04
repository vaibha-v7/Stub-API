// routes/endpointRoutes.js
const express = require("express")
const router = express.Router()
const {
  getAllEndpoints,
  chat,
  confirmEndpoint,
  updateEndpoint,
  deleteEndpoint,
} = require("../controllers/endpointController")

router.get("/", getAllEndpoints)
router.post("/chat", chat)
router.post("/confirm", confirmEndpoint)
router.put("/:id", updateEndpoint)
router.delete("/:id", deleteEndpoint)

module.exports = router