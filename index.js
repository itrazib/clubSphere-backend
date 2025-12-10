require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(
  cors({
    origin: [process.env.CLIENT_DOMAIN],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    console.log(decoded);
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();

    const db = client.db("ClubSphere");
    const usersCollection = db.collection("users");
    const clubsCollection = db.collection("clubs");
    const membershipsCollection = db.collection("memberships");
    const eventsCollection = db.collection("events");
    const eventRegistrationsCollection = db.collection("event_registrations");
    const paymentsCollection = db.collection("payments");

    // role middlewares
    const verifyADMIN = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin")
        return res
          .status(403)
          .send({ message: "Admin only Actions!", role: user?.role });

      next();
    };

    const verifyClubManager = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "clubManager")
        return res
          .status(403)
          .send({ message: "Seller only Actions!", role: user?.role });

      next();
    };

    // create clubs
    app.post("/clubs", verifyJWT, verifyClubManager, async (req, res) => {
      const clubData = req.body;
      // clubData.managerEmail = req.tokenEmail;

      clubData.status = "pending";
      clubData.createdAt = new Date().toISOString();
      clubData.updateAt = new Date().toISOString();

      const result = await clubsCollection.insertOne(clubData);
      res.send(result);
    });

    // Event creation
    app.post("/events", verifyJWT, verifyClubManager, async (req, res) => {
      const eventData = req.body;
      eventData.createdAt = new Date().toISOString();
      eventData.updatedAt = new Date().toISOString();
      const result = await eventsCollection.insertOne(eventData);
      res.send(result);
    });

    // get all clubs
    app.get("/clubs", async (req, res) => {
      const result = await clubsCollection.find().toArray();
      res.send(result);
    });

    // get all approved clubs
    app.get("/clubs/approved", async (req, res) => {
      const result = await clubsCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });

    // get single club
    app.get("/clubs/:id", async (req, res) => {
      const id = req.params.id;     
      const query = { _id: new ObjectId(id) };
      const result = await clubsCollection.findOne(query);
      res.send(result);
    });

    // clubs update data
    app.patch("/clubs/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      // ❗ IMPORTANT: Prevent _id from being updated
      if (updateData._id) {
        delete updateData._id;
      }

      const query = { _id: new ObjectId(id) };

      const updateFields = {
        $set: {
          ...updateData,
          updateAt: new Date().toISOString(),
        },
      };

      const result = await clubsCollection.updateOne(query, updateFields);
      res.send(result);
    });

    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      userData.role = "member";

      const query = {
        email: userData.email,
      };

      const alreadyExists = await usersCollection.findOne(query);
      console.log("User Already Exists---> ", !!alreadyExists);

      if (alreadyExists) {
        console.log("Updating user info......");
        const result = await usersCollection.updateOne(query, {
          $set: {
            last_loggedIn: new Date().toISOString(),
          },
        });
        return res.send(result);
      }

      console.log("Saving new user info......");
      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // get a user's role
    app.get("/user/role", verifyJWT, async (req, res) => {
      const result = await usersCollection.findOne({ email: req.tokenEmail });
      res.send({ role: result?.role });
    });

    // get all users for admin
    app.get("/users", verifyJWT, async (req, res) => {
      const adminEmail = req.tokenEmail;
      const result = await usersCollection
        .find({ email: { $ne: adminEmail } })
        .toArray();
      res.send(result);
    });

    // update a user's role
    app.patch("/update-role", verifyJWT, async (req, res) => {
      const { email, role } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );
      await sellerRequestsCollection.deleteOne({ email });

      res.send(result);
    });

    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body
      console.log(paymentInfo)
      const payment_total = Number(paymentInfo?.membershipFee) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: paymentInfo?.name,
                description: paymentInfo?.description,
                images: [paymentInfo.bannerImage],
              },
              unit_amount: payment_total,
            },
            quantity: paymentInfo?.quantity,
          },
        ],
        customer_email: paymentInfo?.member?.email,
        mode: 'payment',
        metadata: {
          clubId: paymentInfo?.clubId,
          member: paymentInfo?.member.email,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/clubs/${paymentInfo?.clubId}`,
      })
      res.send({ url: session.url })
    })

    // payment success
     app.post('/payment-success', async (req, res) => {
      const { sessionId } = req.body
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const club = await clubsCollection.findOne({
        _id: new ObjectId(session.metadata.clubId),
      })
      const memberShip = await membershipsCollection.findOne({
        paymentId: session.payment_intent,
      })

      if (session.status === 'complete' && club && !memberShip) {
        // save order data in db
        const memberInfo = {
          clubId: session.metadata.clubId,
          transactionId: session.payment_intent,
          memberEmail: session.metadata.member,
          status: 'pending',
          joinedAt: new Date().toISOString(),
        
         
          // membershipFee: session.amount_total / 100,
          // bannerImage: club?.bannerImage,
        }
        const result = await membershipsCollection.insertOne(memberInfo)
         await paymentsCollection.insertOne({
          paymentId: session.payment_intent,
          clubId: session.metadata.clubId,  
          memberEmail: session.metadata.member,
          type: 'membership',
          amount: session.amount_total / 100,
          status: session.payment_status,
          createdAt: new Date().toISOString(),
        })

        return res.send({
          paymentId: session.payment_intent,
          memberId: result.insertedId,
        })
      }
      res.send(
        res.send({
          paymentIdId: session.payment_intent,
          memberId: memberShip._id,
        })
      )
    })

    // isMember serarch by memberEmail and clubId
    app.get("/is-member", verifyJWT,  async (req, res) => {
      const memberEmail = req.query.memberEmail;
      const clubId = req.query.clubId;  
      const query = { memberEmail, clubId };
      const result = await membershipsCollection.findOne(query);
      // res.send({ isMember: result.status, memberData: result });
      res.send(result.status)
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Server..");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
