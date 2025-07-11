import jwt from "jsonwebtoken";
import express from 'express'
import bcrypt from "bcryptjs";
import validator from "validator";
import userModel from "../models/userModel.js";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import prescriptionModel from "../models/prescriptionModel.js";
import { v2 as cloudinary } from 'cloudinary'
// import userRouter from "../routes/userRoute.js";


// import stripe from "stripe";
// import razorpay from 'razorpay';

// Gateway Initialize
// const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)
// const razorpayInstance = new razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET,
// })

// API to register user
const registerUser = async (req, res) => {

    try {
        const { name, email, password } = req.body;

        // checking for all data to register user
        if (!name || !email || !password) {
            return res.json({ success: false, message: 'Missing Details' })
        }

        // validating email format
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }

        // validating strong password
        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10); // the more no. round the more time it will take
        const hashedPassword = await bcrypt.hash(password, salt)

        const userData = {
            name,
            email,
            password: hashedPassword,
        }

        const newUser = new userModel(userData)
        const user = await newUser.save()
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to login user
const loginUser = async (req, res) => {

    try {
        const { email, password } = req.body;
        const user = await userModel.findOne({ email })

        if (!user) {
            return res.json({ success: false, message: "User does not exist" })
        }

        const isMatch = await bcrypt.compare(password, user.password)

        if (isMatch) {
            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET)
            res.json({ success: true, token })
        }
        else {
            res.json({ success: false, message: "Invalid credentials" })
        }
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to get user profile data
const getProfile = async (req, res) => {

    try {
        const { userId } = req.body
        const userData = await userModel.findById(userId).select('-password')

        res.json({ success: true, userData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}
// Forgot password for users
const forgotPasswordUser = async (req, res) => {
    try {
        const { email } = req.body;
        
        // Find user by email
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, message: 'If this email exists, a reset link has been sent' });
        }

        // Generate reset token (expires in 1 hour)
        const resetToken = jwt.sign(
            { id: user._id }, 
            process.env.JWT_SECRET + user.password, 
            { expiresIn: '1h' }
        );

        // Save token to database
        await userModel.findByIdAndUpdate(user._id, { 
            resetPasswordToken: resetToken,
            resetPasswordExpires: Date.now() + 3600000 // 1 hour from now
        });

        // In a real app, you would send an email here with the reset link
        // For development, we'll log it to console
        const resetUrl = `${req.headers.origin}/reset-password-user?token=${resetToken}`;
        console.log(`Password reset link: ${resetUrl}`);
        
        res.json({ 
            success: true, 
            message: 'If this email exists, a password reset link has been sent',
            token: resetUrl
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Reset password with token for users
const resetPasswordUser = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token and new password are required' 
            });
        }

        // Find user by token
        const user = await userModel.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET + user.password);
        
        // Check password length
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update password and clear reset token
        await userModel.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            resetPasswordToken: undefined,
            resetPasswordExpires: undefined
        });

        res.json({ 
            success: true, 
            message: 'Password reset successfully' 
        });

    } catch (error) {
        console.error(error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ 
                success: false, 
                message: 'Token has expired' 
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid token' 
            });
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};
// API to update user profile
const updateProfile = async (req, res) => {

    try {

        const { userId, name, phone, address, dob, gender,age,econtact,premedical,allergy,blood } = req.body
        const imageFile = req.file

        if (!name || !phone || !dob || !gender||!age||!econtact||!premedical||!allergy||!blood) {
            return res.json({ success: false, message: "Data Missing" })
        }

        await userModel.findByIdAndUpdate(userId, { name, phone, address: JSON.parse(address), dob, gender,age,econtact,premedical,allergy,blood })

        if (imageFile) {

            // upload image to cloudinary
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" })
            const imageURL = imageUpload.secure_url

            await userModel.findByIdAndUpdate(userId, { image: imageURL })
        }

        res.json({ success: true, message: 'Profile Updated' })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to book appointment 
const bookAppointment = async (req, res) => {

    try {

        const { userId, docId, slotDate, slotTime } = req.body
        const docData = await doctorModel.findById(docId).select("-password")

        if (!docData.available) {
            return res.json({ success: false, message: 'Doctor Not Available' })
        }

        let slots_booked = docData.slots_booked

        // checking for slot availablity 
        if (slots_booked[slotDate]) {
            if (slots_booked[slotDate].includes(slotTime)) {
                return res.json({ success: false, message: 'Slot Not Available' })
            }
            else {
                slots_booked[slotDate].push(slotTime)
            }
        } else {
            slots_booked[slotDate] = []
            slots_booked[slotDate].push(slotTime)
        }

        const userData = await userModel.findById(userId).select("-password")

        delete docData.slots_booked

        const appointmentData = {
            userId,
            docId,
            userData,
            docData,
            amount: docData.fees,
            slotTime,
            slotDate,
            date: Date.now()
        }

        const newAppointment = new appointmentModel(appointmentData)
        await newAppointment.save()

        // save new slots data in docData
        await doctorModel.findByIdAndUpdate(docId, { slots_booked })

        res.json({ success: true, message: 'Appointment Booked' })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }

}

// API to cancel appointment
const cancelAppointment = async (req, res) => {
    try {

        const { userId, appointmentId } = req.body
        const appointmentData = await appointmentModel.findById(appointmentId)

        // verify appointment user 
        if (appointmentData.userId !== userId) {
            return res.json({ success: false, message: 'Unauthorized action' })
        }

        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true })

        // releasing doctor slot 
        const { docId, slotDate, slotTime } = appointmentData

        const doctorData = await doctorModel.findById(docId)

        let slots_booked = doctorData.slots_booked

        slots_booked[slotDate] = slots_booked[slotDate].filter(e => e !== slotTime)

        await doctorModel.findByIdAndUpdate(docId, { slots_booked })

        res.json({ success: true, message: 'Appointment Cancelled' })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to get user appointments for frontend my-appointments page
const listAppointment = async (req, res) => {
    try {

        const { userId } = req.body
        const appointments = await appointmentModel.find({ userId })

        res.json({ success: true, appointments })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to make payment of appointment using razorpay
// const paymentRazorpay = async (req, res) => {
//     try {

//         const { appointmentId } = req.body
//         const appointmentData = await appointmentModel.findById(appointmentId)

//         if (!appointmentData || appointmentData.cancelled) {
//             return res.json({ success: false, message: 'Appointment Cancelled or not found' })
//         }

//         // creating options for razorpay payment
//         const options = {
//             amount: appointmentData.amount * 100,
//             currency: process.env.CURRENCY,
//             receipt: appointmentId,
//         }

//         // creation of an order
//         const order = await razorpayInstance.orders.create(options)

//         res.json({ success: true, order })

//     } catch (error) {
//         console.log(error)
//         res.json({ success: false, message: error.message })
//     }
// }

// API to verify payment of razorpay
// const verifyRazorpay = async (req, res) => {
//     try {
//         const { razorpay_order_id } = req.body
//         const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id)

//         if (orderInfo.status === 'paid') {
//             await appointmentModel.findByIdAndUpdate(orderInfo.receipt, { payment: true })
//             res.json({ success: true, message: "Payment Successful" })
//         }
//         else {
//             res.json({ success: false, message: 'Payment Failed' })
//         }
//     } catch (error) {
//         console.log(error)
//         res.json({ success: false, message: error.message })
//     }
// }

// API to make payment of appointment using Stripe
// const paymentStripe = async (req, res) => {
//     try {

//         const { appointmentId } = req.body
//         const { origin } = req.headers

//         const appointmentData = await appointmentModel.findById(appointmentId)

//         if (!appointmentData || appointmentData.cancelled) {
//             return res.json({ success: false, message: 'Appointment Cancelled or not found' })
//         }

//         const currency = process.env.CURRENCY.toLocaleLowerCase()

//         const line_items = [{
//             price_data: {
//                 currency,
//                 product_data: {
//                     name: "Appointment Fees"
//                 },
//                 unit_amount: appointmentData.amount * 100
//             },
//             quantity: 1
//         }]

//         const session = await stripeInstance.checkout.sessions.create({
//             success_url: `${origin}/verify?success=true&appointmentId=${appointmentData._id}`,
//             cancel_url: `${origin}/verify?success=false&appointmentId=${appointmentData._id}`,
//             line_items: line_items,
//             mode: 'payment',
//         })

//         res.json({ success: true, session_url: session.url });

//     } catch (error) {
//         console.log(error)
//         res.json({ success: false, message: error.message })
//     }
// }

// const verifyStripe = async (req, res) => {
//     try {

//         const { appointmentId, success } = req.body

//         if (success === "true") {
//             await appointmentModel.findByIdAndUpdate(appointmentId, { payment: true })
//             return res.json({ success: true, message: 'Payment Successful' })
//         }

//         res.json({ success: false, message: 'Payment Failed' })

//     } catch (error) {
//         console.log(error)
//         res.json({ success: false, message: error.message })
//     }

// }
// API to get prescriptions for a user
// 


// In your backend routes (e.g., userRoutes.js)
const paymentStatus = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    
    const updatedAppointment = await appointmentModel.findByIdAndUpdate(
      appointmentId,
      { payment: true }
    );

    if (!updatedAppointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    res.json({ success: true, message: 'Payment status updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



const getPrescription = async (req, res) => {
    try {
        const { userId } = req.body; // Get userId from the authenticated request

        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID is required" });
        }

        const prescriptions = await prescriptionModel
            .find({ userId })
            .populate("docId", "name speciality") // Fetch doctor name & speciality
            .sort({ createdAt: -1 }) // Sort latest first
            .lean(); // Convert to plain objects

        // Modify response to fit UI structure
        const formattedPrescriptions = prescriptions.map(prescription => ({
            _id: prescription._id,
            doctor: {
                name: prescription.docId?.name || "Unknown Doctor",
                speciality: prescription.docId?.speciality || "General",
            },
            medicines: prescription.medicines || [],
            notes: prescription.notes || "No additional notes",
            createdAt: prescription.createdAt,
        }));

        res.json({ success: true, prescriptions: formattedPrescriptions });

    } catch (error) {
        console.error("Error fetching prescriptions:", error);
        res.status(500).json({ success: false, message: "An error occurred while fetching prescriptions" });
    }
};
export {
    loginUser,
    registerUser,
    getProfile,
    updateProfile,
    bookAppointment,
    listAppointment,
    cancelAppointment,
    // paymentRazorpay,
    // verifyRazorpay,
    // paymentStripe,
    // verifyStripe,
        getPrescription,
        forgotPasswordUser,
        resetPasswordUser,
        paymentStatus

}