require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
  
    next();
  } catch (err) {
    
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
    // await client.connect();

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

    // event Registration
    app.post("/events/join", async (req, res) => {
      const userData = req.body;
      userData.status = "registered";
      userData.registerAt = new Date().toISOString();
      // console.log(userData);
      const result = await eventRegistrationsCollection.insertOne(userData);
      res.send(result);
    });

    app.get("/events/isJoined", verifyJWT, async (req, res) => {
      const eventId = req.query.eventId;
      const userEmail = req.query.userEmail;
      const query = { eventId, userEmail };
      const result = await eventRegistrationsCollection.findOne(query);

      res.send(result?.status || "none")
    });

    // event Register by eventId

    app.get(
      "/eventRegister/:eventId",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        const eventId = req.params.eventId;
        const result = await eventRegistrationsCollection
          .find({ eventId })
          .toArray();
        res.send(result);
      }
    );

    
    // ALL UPCOMING EVENTS API
    
    app.get("/events/upcoming", async (req, res) => {
      try {
        // Today's date in YYYY-MM-DD
        const today = new Date().toISOString().split("T")[0];

        const upcomingEvents = await eventsCollection
          .find({
            date: { $gte: today },
          })
          .sort({ date: 1 }) // nearest event first
          .toArray();

        res.status(200).send(upcomingEvents);
      } catch (error) {
        console.error("Error fetching upcoming events:", error);
        res.status(500).send({ message: "Server Error" });
      }
    });

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

    // create events by clubId
    app.post(
      "/events/:clubId",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        const clubId = req.params.clubId;
        const club = await clubsCollection.findOne({
          _id: new ObjectId(clubId),
        });
        const eventData = req.body;
        eventData.clubName = club.name;
        eventData.clubId = clubId;
        eventData.createdAt = new Date().toISOString();
        eventData.updateAt = new Date().toISOString();
        const result = await eventsCollection.insertOne(eventData);
        res.send(result);
      }
    );

    // get events by clubId
    app.get("/events/:clubId", async (req, res) => {
      const clubId = req.params.clubId;
      const result = await eventsCollection.find({ clubId }).toArray();
      res.send(result);
    });

    app.get("/club-page/:id", async (req, res) => {
      try {
        const clubId = req.params.id; // ✅ FIXED
        const userEmail = req.query.email;

        // 1. Club Details
        const club = await clubsCollection.findOne({
          _id: new ObjectId(clubId),
        });

        // 2. Member Count
        const memberCount = await membershipsCollection.countDocuments({
          clubId: req.params.id, // clubId stored as string in DB
        });

        // 3. Membership Status
        const membership = await membershipsCollection.findOne({
          clubId: req.params.id,
          memberEmail: userEmail,
        });

        const isMember = membership?.status || "none";

        // 4. Events (fetch only if active member)
        let events = [];
        if (isMember === "active") {
          events = await eventsCollection
            .find({ clubId: req.params.id })
            .toArray();
        }

        res.status(200).json({
          club,
          memberCount,
          isMember,
          events,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server Error" });
      }
    });

    // event details page api
    app.get("/eventDetails/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventsCollection.findOne(query);
      res.send(result);
    });

    // all events
    app.get("/events", async (req, res) => {
      const result = await eventsCollection.find().toArray();
      res.send(result);
    });

    // update event by eventId
    app.patch(
      "/events/:eventId",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        const eventId = req.params.eventId;
        const updateData = req.body;
        // ❗ IMPORTANT: Prevent _id from being updated
        if (updateData._id) {
          delete updateData._id;
        }
        const query = { _id: new ObjectId(eventId) };

        const updateFields = {
          $set: {
            ...updateData,
            updateAt: new Date().toISOString(),
          },
        };
        const result = await eventsCollection.updateOne(query, updateFields);
        res.send(result);
      }
    );

    // admin payments part
    app.get("/admin/payments", verifyJWT, async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    });

    // admin stats
    app.get("/admin/stats", verifyJWT, verifyADMIN, async (req, res) => {
      const adminEmail = req.tokenEmail;

      // await usersCollection.find({ email: { $ne: adminEmail } }).toArray();
      try {
        const totalUsers = await usersCollection.countDocuments({
          email: { $ne: adminEmail },
        });
        const totalClubsPending = await clubsCollection.countDocuments({
          status: "pending",
        });
        const totalClubsApproved = await clubsCollection.countDocuments({
          status: "approved",
        });
        const totalClubsRejected = await clubsCollection.countDocuments({
          status: "rejected",
        });

        const totalMemberships = await membershipsCollection.countDocuments();
        const totalEvents = await eventsCollection.countDocuments();

        const payments = await paymentsCollection
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray();

        const totalPayments = payments[0]?.total || 0;

        res.send({
          totalUsers,
          totalClubs: {
            pending: totalClubsPending,
            approved: totalClubsApproved,
            rejected: totalClubsRejected,
          },
          totalMemberships,
          totalEvents,
          totalPayments,
        });
      } catch (error) {
        res.status(500).send({ message: "Server Error" });
      }
    });

    // admin analytics
    // Admin Analytics Graph Data
    app.get("/admin/analytics", verifyJWT, verifyADMIN, async (req, res) => {
      try {
        const adminEmail = req.tokenEmail
        const lastMonths = [...Array(6)]
          .map((_, i) => {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            return d.toISOString().slice(0, 7); // YYYY-MM
          })
          .reverse();

        const usersData = await Promise.all(
          lastMonths.map(async (month) => {
            const count = await usersCollection.countDocuments({
              created_at: { $regex: `^${month}` },email: { $ne: adminEmail }
            });
            return count;
          })
        );

        const paymentsData = await Promise.all(
          lastMonths.map(async (month) => {
            const result = await paymentsCollection
              .aggregate([
                { $match: { createdAt: { $regex: `^${month}` } } },
                { $group: { _id: null, total: { $sum: "$amount" } } },
              ])
              .toArray();
            return result[0]?.total || 0;
          })
        );

        res.send({
          months: lastMonths,
          usersData,
          paymentsData,
        });
      } catch (err) {
        res.status(500).send({ message: "Analytics error" });
      }
    });

    // members and event Count

    app.get("/clubs/:id/stats", async (req, res) => {
      const clubId = req.params.id;

      try {
        // Count members
        const membersCount = await membershipsCollection.countDocuments({
          clubId,
          status: "active",
        });

        // Count events created by this club
        const eventsCount = await eventsCollection.countDocuments({ clubId });

        res.send({
          membersCount,
          eventsCount,
        });
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // Manager Overview (Simple app.get)
    app.get(
      "/manager/overview",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        try {
          const managerEmail = req.tokenEmail;

          // CLUB IDS 
          const clubs = await clubsCollection
            .find({ managerEmail })
            .project({ _id: 1 })
            .toArray();

          const clubIds = clubs.map((c) => c._id.toString());

          // BASIC STATS 
          const clubsManaged = clubIds.length;

          const totalMembers = await membershipsCollection.countDocuments({
            clubId: { $in: clubIds },
            status: "active",
          });

          const eventsCreated = await eventsCollection.countDocuments({
            clubId: { $in: clubIds },
          });

          const paymentsAgg = await paymentsCollection
            .aggregate([
              { $match: { clubId: { $in: clubIds } } },
              { $group: { _id: null, total: { $sum: "$amount" } } },
            ])
            .toArray();

          const totalPayments = paymentsAgg[0]?.total || 0;

          //  MONTHLY EVENTS GRAPH 
          const monthlyEvents = await eventsCollection
            .aggregate([
              {
                $match: {
                  clubId: { $in: clubIds },
                },
              },
              {
                $addFields: {
                  month: { $month: { $toDate: "$createdAt" } },
                },
              },
              {
                $group: {
                  _id: "$month",
                  events: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ])
            .toArray();

          const monthNames = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];

          const monthlyStats = monthlyEvents.map((item) => ({
            month: monthNames[item._id - 1],
            events: item.events,
          }));

          // RESPONSE 
          res.send({
            clubsManaged,
            totalMembers,
            eventsCreated,
            totalPayments,
            monthlyStats, // GRAPH DATA
          });
        } catch (error) {
          res.status(500).send({ message: "Server Error" });
        }
      }
    );

    // manager analytics
    app.get(
      "/manager/analytics",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        try {
          const managerEmail = req.tokenEmail;

          const clubs = await clubsCollection
            .find({ managerEmail })
            .project({ _id: 1 })
            .toArray();

          const clubIds = clubs.map((c) => c._id.toString());

          // Monthly Events
          const monthlyEvents = await eventsCollection
            .aggregate([
              { $match: { clubId: { $in: clubIds } } },
              {
                $addFields: {
                  month: { $month: { $toDate: "$createdAt" } },
                },
              },
              {
                $group: {
                  _id: "$month",
                  count: { $sum: 1 },
                },
              },
              { $sort: { _id: 1 } },
            ])
            .toArray();

          const monthNames = [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];

          const eventsPerMonth = monthlyEvents.map((m) => ({
            month: monthNames[m._id - 1],
            events: m.count,
          }));

          // Monthly Payments
          const monthlyPayments = await paymentsCollection
            .aggregate([
              { $match: { clubId: { $in: clubIds } } },
              {
                $addFields: {
                  month: { $month: { $toDate: "$createdAt" } },
                },
              },
              {
                $group: {
                  _id: "$month",
                  amount: { $sum: "$amount" },
                },
              },
              { $sort: { _id: 1 } },
            ])
            .toArray();

          const paymentsPerMonth = monthlyPayments.map((m) => ({
            month: monthNames[m._id - 1],
            amount: m.amount,
          }));

          res.send({
            eventsPerMonth,
            paymentsPerMonth,
          });
        } catch (err) {
          res.status(500).send({ message: "Server Error" });
        }
      }
    );

    // member stats
    app.get("/member/stats", verifyJWT, async (req, res) => {
      const memberEmail = req.query.email; // frontend sends ?email=user@gmail.com

      try {
        // Count how many clubs this member joined
        const clubsJoined = await membershipsCollection.countDocuments({
          memberEmail,
          status: "active",
        });

        // Count how many events this user registered
        const eventsJoined = await eventRegistrationsCollection.countDocuments({
          userEmail: memberEmail,
          status: "registered",
        });

        res.send({
          totalClubsJoined: clubsJoined,
          totalEventsJoined: eventsJoined,
        });
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // member Clubs
    app.get("/member/my-clubs", verifyJWT, async (req, res) => {
      const email = req.query.email;

      const memberships = await membershipsCollection
        .find({ memberEmail: email, status: "active" })
        .toArray();

      const clubIds = memberships.map((m) => m.clubId);

      const clubs = await clubsCollection
        .find({ _id: { $in: clubIds.map((id) => new ObjectId(id)) } })
        .project({ name: 1, location: 1 })
        .toArray();

      const result = memberships.map((m) => {
        const club = clubs.find(
          (c) => c._id.toString() === m.clubId.toString()
        );
        return {
          clubId: m.clubId,
          clubName: club?.name,
          location: club?.location,
          status: m.status,
          expiryDate: m.expiryDate || null,
        };
      });

      res.send(result);
    });

    // my events
    app.get("/member/my-events", verifyJWT, async (req, res) => {
      const email = req.query.email;

      try {
        // All events the member registered
        const registrations = await eventRegistrationsCollection
          .find({ userEmail: email })
          .toArray();

        const eventIds = registrations.map((r) => new ObjectId(r.eventId));

        // Get event details
        const events = await eventsCollection
          .find({ _id: { $in: eventIds } })
          .project({ title: 1, clubName: 1, date: 1 })
          .toArray();

        const result = registrations.map((reg) => {
          const event = events.find(
            (ev) => ev._id.toString() === reg.eventId.toString()
          );

          return {
            _id: reg._id,
            title: event?.title,
            clubName: event?.clubName,
            date: event?.date,
            status: reg.status,
          };
        });

        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // member payments
    app.get("/member/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email required" });
      }

      try {
        const payments = await paymentsCollection
          .find({ memberEmail: email })
          .sort({ date: -1 }) // newest first
          .toArray();

        res.send(payments);
      } catch (err) {
        
        res.status(500).send({ message: "Failed to load payments" });
      }
    });

    // up-coming Events
    app.get("/member/upcoming-events", verifyJWT, async (req, res) => {
      const email = req.query.email; // frontend: ?email=user@gmail.com

      try {
        // 1️⃣ Get clubs the member has joined
        const joinedClubs = await membershipsCollection
          .find({
            memberEmail: email,
            status: "active",
          })
          .project({ clubId: 1 })
          .toArray();

        const clubIds = joinedClubs.map((c) => c.clubId);

        if (clubIds.length === 0) {
          return res.send([]);
        }

        // 2️⃣ Get upcoming events from those clubs
        const today = new Date().toISOString();

        const upcomingEvents = await eventsCollection
          .find({
            clubId: { $in: clubIds },
            date: { $gte: today }, // future events only
          })
          .sort({ date: 1 }) // earliest first
          .toArray();

        res.send(upcomingEvents);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // delete event by eventId
    app.delete(
      "/events/:eventId",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        const eventId = req.params.eventId;
        const query = { _id: new ObjectId(eventId) };
        const result = await eventsCollection.deleteOne(query);
        res.send(result);
      }
    );

    // get all clubs
    app.get("/clubs", verifyJWT, async (req, res) => {
      const result = await clubsCollection.find().toArray();
      res.send(result);
    });

    // get all approved clubs
    // app.get("/clubs/approved", async (req, res) => {
    //   const result = await clubsCollection
    //     .find({ status: "approved" })
    //     .toArray();
    //   res.send(result);
    // });

    // get approved clubs with member count
    app.get("/clubs/approved", async (req, res) => {
      const clubs = await clubsCollection
        .find({ status: "approved" })
        .toArray();

      const result = await Promise.all(
        clubs.map(async (club) => {
          const count = await membershipsCollection.countDocuments({
            clubId: club._id.toString(),
            status: "active",
          });
          return {
            ...club,
            membersCount: count,
          };
        })
      );

      res.send(result);
    });

    // get all members for each club
    app.get(
      "/memberships/:clubId",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        const clubId = req.params.clubId;
        const result = await membershipsCollection.find({ clubId }).toArray();
        res.send(result);
      }
    );

    // memeberships status update
    app.patch(
      "/memberships/:id/expire",
      verifyJWT,
      verifyClubManager,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;
        const query = { _id: new ObjectId(id) };

        const updateFields = {
          $set: {
            status,
            updatedAt: new Date().toISOString(),
          },
        };

        // for expire then membership data to deleteNone collection

        const result = await membershipsCollection.updateOne(
          query,
          updateFields
        );

        await membershipsCollection.deleteOne(query);
        res.send(result);
      }
    );

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
      // console.log("User Already Exists---> ", !!alreadyExists);

      if (alreadyExists) {
        // console.log("Updating user info......");
        const result = await usersCollection.updateOne(query, {
          $set: {
            last_loggedIn: new Date().toISOString(),
          },
        });
        return res.send(result);
      }

      // console.log("Saving new user info......");
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

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      // console.log(paymentInfo);
      const payment_total = Number(paymentInfo?.membershipFee) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "usd",
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
        mode: "payment",
        metadata: {
          clubId: paymentInfo?.clubId,
          member: paymentInfo?.member.email,
        },
        success_url: `${process.env.CLIENT_DOMAIN}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.CLIENT_DOMAIN}/clubs/${paymentInfo?.clubId}`,
      });
      res.send({ url: session.url });
    });

    // payment success
    app.post("/payment-success", async (req, res) => {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const club = await clubsCollection.findOne({
        _id: new ObjectId(session.metadata.clubId),
      });
      const memberShip = await membershipsCollection.findOne({
        paymentId: session.payment_intent,
      });

      if (session.status === "complete" && club && !memberShip) {
        // save order data in db
        const memberInfo = {
          memberName: session.customer_details.name,
          clubId: session.metadata.clubId,
          transactionId: session.payment_intent,
          memberEmail: session.metadata.member,
          status: "active",
          joinedAt: new Date().toISOString(),

          // membershipFee: session.amount_total / 100,
          // bannerImage: club?.bannerImage,
        };
        const result = await membershipsCollection.insertOne(memberInfo);
        await paymentsCollection.insertOne({
          paymentId: session.payment_intent,
          clubId: session.metadata.clubId,
          club: club.name,
          memberEmail: session.metadata.member,
          type: "membership",
          amount: session.amount_total / 100,
          status: session.payment_status,
          createdAt: new Date().toISOString(),
        });

        return res.send({
          paymentId: session.payment_intent,
          memberId: result.insertedId,
        });
      }
      res.send(
        res.send({
          paymentIdId: session.payment_intent,
          memberId: memberShip._id,
        })
      );
    });

    // isMember serarch by memberEmail and clubId
    app.get("/is-member", verifyJWT, async (req, res) => {
      const memberEmail = req.query.memberEmail;
      const clubId = req.query.clubId;
      const query = { memberEmail, clubId };
      const result = await membershipsCollection.findOne(query);
      // res.send({ isMember: result.status, memberData: result });
      res.send(result.status);
    });

    // total user count
    app.get("/users/count", verifyJWT, async (req, res) => {
      const count = await usersCollection.countDocuments();
      // console.log(count);
    });

    // memberships count by clubId
    app.get("/memberships/count/:clubId", async (req, res) => {
      const clubId = req.params.clubId;
      const count = await membershipsCollection.countDocuments({ clubId });
      res.send({ count });
    });

    // await client.db("admin").command({ ping: 1 });
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
