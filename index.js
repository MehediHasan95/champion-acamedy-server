const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(`${process.env.PAY_SECRET_KEY}`);
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
    const cartsCollection = championDB.collection("carts");
    const purchaseCollection = championDB.collection("purchase");
    const contactCollection = championDB.collection("contacts");
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
        expiresIn: "1d",
      });
      res.send({ token });
    });

    app.get("/role-check", verifyRole, async (req, res) => {
      res.send({ role: req.query.role });
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

    app.get("/manage-classes", verifyJWT, verifyRole, async (req, res) => {
      const results = await classCollection
        .find()
        .sort({ create: 1 })
        .toArray();
      res.send(results);
    });

    app.get("/manage-classes/:id", verifyJWT, verifyRole, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.patch("/manage-classes/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set:
          Object.keys(data).length >= 4
            ? {
                courseName: data.courseName,
                price: data.price,
                seats: data.seats,
                image: data.image,
              }
            : {
                status: data.status,
                feedback: data.feedback,
              },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/manage-classes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const users = req.body;
      const isExist = await userCollection.findOne({ uid: { $eq: users.uid } });
      if (!isExist) {
        const result = await userCollection.insertOne(users);
        res.send(result);
      } else {
        res.send({ exist: true });
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

    app.patch("/profile/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: data,
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
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
    app.get("/all-instructor", async (req, res) => {
      const results = await userCollection
        .aggregate([
          {
            $match: { role: "instructor" },
          },
        ])
        .toArray();
      res.send(results);
    });

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

    app.get("/profile", verifyJWT, async (req, res) => {
      if (req.decoded.uid === req.query.uid) {
        const result = await userCollection.findOne({
          uid: { $eq: req.query.uid },
        });
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    app.get("/all-classes", async (req, res) => {
      const results = await classCollection
        .find({ status: { $eq: "approve" } })
        .sort({ enroll: -1 })
        .toArray();
      res.send(results);
    });

    app.get("/add-to-cart", verifyJWT, async (req, res) => {
      const results = await cartsCollection
        .find({ uid: { $eq: req.query.uid } })
        .toArray();
      res.send(results);
    });

    app.post("/add-to-cart", verifyJWT, async (req, res) => {
      const data = req.body;
      const isExist = await cartsCollection.findOne({
        classId: { $eq: req.body.classId },
      });
      if (!isExist) {
        const result = await cartsCollection.insertOne(data);
        res.send(result);
      } else {
        res.send({ exist: true });
      }
    });

    app.delete("/add-to-cart/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { total } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseFloat((total * 100).toFixed(2)),
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", verifyJWT, async (req, res) => {
      const data = req.body;
      await classCollection.updateMany(
        {
          _id: { $in: data?.carts?.map((e) => new ObjectId(e.classId)) },
          seats: { $gt: 0 },
        },
        { $inc: { seats: -1, enroll: 1 } }
      );

      const results = await cartsCollection.deleteMany({
        uid: { $eq: data.uid },
      });

      await purchaseCollection.insertOne(data);
      res.send(results);
    });

    app.get("/payment-history/:id", verifyJWT, async (req, res) => {
      const results = await purchaseCollection
        .find({ uid: { $eq: req.params.id } })
        .sort({ create: -1 })
        .toArray();
      res.send(results);
    });

    app.get("/contacts", verifyJWT, verifyRole, async (req, res) => {
      const results = await contactCollection.find().toArray();
      res.send(results);
    });

    app.post("/contacts", async (req, res) => {
      const data = req.body;
      const result = await contactCollection.insertOne(data);
      res.send(result);
    });

    app.delete("/contact/:id", verifyJWT, verifyRole, async (req, res) => {
      const results = await contactCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(results);
    });

    // -----------------------------------------------------------
  } finally {
    app.listen(port, () =>
      console.log("Champion Academy server is running successfully")
    );
  }
}
run().catch(console.dir);
