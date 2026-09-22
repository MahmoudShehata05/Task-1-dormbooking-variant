import express from "express";
import {
  createBooking,
  getAllBookings,
  getBooking,
  updateBooking,
  deleteBooking,
} from "../controllers/bookingController.js";

const router = express.Router();

router.post("/", createBooking);
router.get("/", getAllBookings);
router.get("/:id", getBooking);
router.put("/:id", updateBooking);
router.delete("/:id", deleteBooking);

export default router;
