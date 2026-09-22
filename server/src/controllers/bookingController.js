import Joi from "joi";
import Booking from "../models/Booking.js";

// ── Validation ────────────────────────────────────────────────
// startDate < endDate can't be expressed by Joi's type system alone,
// so it's added as a custom rule on the object itself.
const bookingSchema = Joi.object({
  roomNumber: Joi.string().required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  purpose: Joi.string().allow("", null),
  bookedBy: Joi.string().hex().length(24).allow(null), // Mongo ObjectId as string
}).custom((value, helpers) => {
  if (new Date(value.startDate) >= new Date(value.endDate)) {
    return helpers.message("startDate must be strictly before endDate");
  }
  return value;
});

// For updates, every field is optional (PATCH-style partial update),
// but if both dates are present we still need to check their order.
const bookingUpdateSchema = Joi.object({
  roomNumber: Joi.string(),
  startDate: Joi.date(),
  endDate: Joi.date(),
  purpose: Joi.string().allow("", null),
  bookedBy: Joi.string().hex().length(24).allow(null),
}).custom((value, helpers) => {
  if (
    value.startDate &&
    value.endDate &&
    new Date(value.startDate) >= new Date(value.endDate)
  ) {
    return helpers.message("startDate must be strictly before endDate");
  }
  return value;
});

// ── Overlap check ────────────────────────────────────────────
// Two ranges [aStart, aEnd) and [bStart, bEnd) overlap iff:
//   aStart < bEnd  AND  bStart < aEnd
// excludeId is passed on updates so a booking is never compared
// against itself.
async function hasConflict(roomNumber, startDate, endDate, excludeId = null) {
  const query = {
    roomNumber,
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const conflict = await Booking.findOne(query);
  return conflict;
}

// ── Controllers ──────────────────────────────────────────────

// POST /bookings
export const createBooking = async (req, res) => {
  try {
    const { error, value } = bookingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const conflict = await hasConflict(
      value.roomNumber,
      value.startDate,
      value.endDate
    );
    if (conflict) {
      return res.status(409).json({
        error: `Room ${value.roomNumber} is already booked for an overlapping time range`,
      });
    }

    const booking = await Booking.create(value);
    res.status(201).json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /bookings
export const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find().populate("bookedBy", "name email");
    res.status(200).json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /bookings/:id
export const getBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate(
      "bookedBy",
      "name email"
    );
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.status(200).json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT/PATCH /bookings/:id
export const updateBooking = async (req, res) => {
  try {
    const { error, value } = bookingUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const existing = await Booking.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // Merge incoming changes onto the existing booking so the conflict
    // check always runs against the *final* room/date range, even if
    // the request only changed one field (e.g. just endDate).
    const roomNumber = value.roomNumber ?? existing.roomNumber;
    const startDate = value.startDate ?? existing.startDate;
    const endDate = value.endDate ?? existing.endDate;

    if (new Date(startDate) >= new Date(endDate)) {
      return res
        .status(400)
        .json({ error: "startDate must be strictly before endDate" });
    }

    const conflict = await hasConflict(
      roomNumber,
      startDate,
      endDate,
      existing._id
    );
    if (conflict) {
      return res.status(409).json({
        error: `Room ${roomNumber} is already booked for an overlapping time range`,
      });
    }

    Object.assign(existing, value);
    await existing.save();
    res.status(200).json(existing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE /bookings/:id
export const deleteBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.status(200).json({ message: "Booking deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
