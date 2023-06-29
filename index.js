const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const client = new MongoClient(
  `mongodb+srv://${process.env.BUCKET_NAME}:${process.env.SECRET_KEY}@cluster0.mnvzcly.mongodb.net/?retryWrites=true&w=majority`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);

// Firebase config
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// middleware JWT
const verifyJWT = (req, res, next) => {
  const token = req?.headers?.authorization;
  if (token) {
    jwt.verify(token, process.env.PRIVATE_KEY, (err, decoded) => {
      if (err) {
        res.status(401).send({ message: "unauthorized" });
      } else {
        req.decoded = decoded;
        next();
      }
    });
  } else {
    res.status(401).send({ message: "unauthorized" });
  }
};

async function run() {
  try {
    app.get("/", (req, res) =>
      res.send("Champion Academy server run successfully")
    );
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");

    // ----
    const championDB = client.db("championAcademyDB");
    const userCollection = championDB.collection("users");
    const classCollection = championDB.collection("classes");
    // ----

    // middleware
    const verifyRole = async (req, res, next) => {
      const matched = await userCollection.findOne({
        uid: { $eq: req.query.uid },
      });
      if (matched?.role === "admin" || matched?.role === "instructor") {
        req.query.role = matched?.role;
        next();
      } else {
        res.send({ role: matched?.role });
      }
    };

    // ---
    app.post("/jwt", (req, res) => {
      const data = req.body;
      const token = jwt.sign(data, process.env.PRIVATE_KEY, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    app.get("/role-check", verifyJWT, verifyRole, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        res.send({ role: req.query.role });
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    //  ADMIN ROUTE
    app.get("/users", verifyJWT, verifyRole, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await userCollection
          .find()
          .sort({ create: 1 })
          .toArray();
        res.send(results);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    app.post("/users", async (req, res) => {
      const users = req.body;
      const isExist = await userCollection.findOne({ uid: { $eq: users.uid } });
      if (!isExist) {
        const result = await userCollection.insertOne(users);
        res.send(result);
      }
    });

    app.patch("/users/:id", verifyJWT, verifyRole, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      if (req.decoded.uid === req.query.uid) {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: data.role,
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    app.delete("/users", verifyJWT, verifyRole, (req, res) => {
      const { uid, id, did } = req.query;
      const query = { _id: new ObjectId(id) };
      if (req.decoded.uid === uid) {
        admin
          .auth()
          .deleteUser(did)
          .then(async () => {
            const result = await userCollection.deleteOne(query);
            res.send(result);
          })
          .catch((e) => {
            res.send({ message: e.message });
          });
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    // INSTRUCTOR ROUTE

    app.get("/myclasses", verifyJWT, verifyRole, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const results = await classCollection
          .find({ uid: { $eq: req.query.uid } })
          .toArray();
        res.send(results);
      }
    });

    app.post("/add-class", verifyJWT, verifyRole, async (req, res) => {
      const data = req.body;
      if (req.decoded.uid === req.query.uid) {
        const result = await classCollection.insertOne(data);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });
    //---------------------

    // FOR ALL USERS ROUTE
    app.get("/all-classes", async (req, res) => {
      const results = await classCollection
        .find()
        .sort({ create: 1 })
        .toArray();
      res.send(results);
    });
  } finally {
    app.listen(port, () =>
      console.log("Champion Academy server is running successfully")
    );
  }
}
run().catch(console.dir);
