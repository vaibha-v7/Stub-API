const mongoose = require("mongoose")

const endpointSchema = new mongoose.Schema({
  name: { type: String, required: true },
  method: { type: String, required: true },
  fields: [
    {
      name: { type: String, required: true },
    }
  ],
  generatedData: { type: mongoose.Schema.Types.Mixed },
  latencyMs: { type: Number, default: 0 },
  forceError: { type: Number, default: null },
})

module.exports = mongoose.model("Endpoint", endpointSchema)