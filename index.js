const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");
const os = require("os");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Middleware to parse JSON requests
app.use(express.json());

// Middleware to parse URL-encoded requests
app.use(express.urlencoded({ extended: true }));

const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.gi5qy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server (optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit();
  }
}
run().catch(console.dir);

// Basic route
app.get("/", (req, res) => {
  res.send("server is running....");
});

app.post("/test", async (req, res) => {
  console.log(req.body);
  res.status(200).send({ message: "got the test message" });
});

app.post("/adduser", async (req, res) => {
  const user = req.body;
  try {
    const existingUser = await client
      .db("StayNestDB")
      .collection("users")
      .findOne({ email: user.email });
    if (existingUser) {
      console.log("User already exists");
      res
        .status(409)
        .send({ message: "User already exists", email: user.email });
    } else {
      await client.db("StayNestDB").collection("users").insertOne(user);
      console.log("User added successfully");
      res
        .status(200)
        .send({ message: "User added successfully", email: user.email });
    }
  } catch (error) {
    console.error("Error adding user:", error);
    res
      .status(500)
      .send({ message: "Error adding user", error: error.message });
  }
});

app.get("/getuser", async (req, res) => {
  const email = req.query.email;

  try {
    const user = await client
      .db("StayNestDB")
      .collection("users")
      .findOne({ email: email });
    if (user) {
      console.log("User found");
      res.status(200).send({ message: "User found", user: user });
    } else {
      console.log("User not found");
      res.status(404).send({ message: "User not found", email: email });
    }
  } catch (error) {
    console.error("Error getting user:", error);
    res
      .status(500)
      .send({ message: "Error getting user", error: error.message });
  }
});

async function getGeminiData() {
  const url = "https://api.gemini.com/v1/pubticker/btcusd"; // Example endpoint for BTC/USD ticker
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    console.log("Gemini Data:", data);
    return data;
  } catch (error) {
    console.error("Error fetching data from Gemini API:", error);
  }
}

// Example usage of the getGeminiData function
app.get("/gemini", async (req, res) => {
  const data = await getGeminiData();
  if (data) {
    res.status(200).send(data);
  } else {
    res.status(500).send({ message: "Error fetching Gemini data" });
  }
});

app.post("/sensor_data", async (req, res) => {
  const sensorData = req.body;
  const currentTime =
    new Date().toISOString().split("T")[1].split(":")[0] +
    ":" +
    new Date().toISOString().split("T")[1].split(":")[1];
  console.log(`Current Time: ${currentTime}, Sensor Data:`, sensorData);
  try {
    await client
      .db("StayNestDB")
      .collection("sensor_data")
      .insertOne(sensorData);
    // Send response after successful insertion
    res.status(200).send({ message: "Sensor data added successfully" });
  } catch (error) {
    console.error(`Error adding sensor data at ${currentTime}:`, error);
    res
      .status(500)
      .send({ message: "Error adding sensor data", error: error.message });
  }
});

app.get("/get_sensor_data", async (req, res) => {
  const email = req.query.email;
  const sensorData = await client
    .db("StayNestDB")
    .collection("sensor_data")
    .find({ email: email })
    .toArray();
  res.status(200).send(sensorData);
});

async function watchSensorDataCollection() {
  const changeStream = client
    .db("StayNestDB")
    .collection("sensor_data")
    .watch();
  changeStream.on("change", (change) => {
    console.log("Change detected in sensor_data collection:", change);
    io.emit("sensorDataUpdated", change);
  });
}

// Call the watch function

watchSensorDataCollection();

// Create an HTTP server
const server = http.createServer(app);
const io = new Server(server);

// Start the server
server.listen(PORT, "0.0.0.0", () => {
  const networkInterfaces = os.networkInterfaces();
  let ipAddress = "";

  // Loop through network interfaces to find the first non-internal IPv4 address
  for (const interfaceName in networkInterfaces) {
    for (const net of networkInterfaces[interfaceName]) {
      if (net.family === "IPv4" && !net.internal) {
        ipAddress = net.address;
        break;
      }
    }
    if (ipAddress) break; // Exit the loop if an IP address is found
  }

  console.log(`Server is running on http://${ipAddress}:${PORT}`);
});
