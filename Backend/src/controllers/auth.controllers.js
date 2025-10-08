const userModel = require('../models/user.model')
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

async function registerUser(req, res) {
    const { fullName: { firstName, lastName }, email, password } = req.body;

    const isUserExist = await userModel.findOne({
        email
    })
    if (isUserExist) {
        return res.status(400).json({
            message: "user already exists!"
        })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await userModel.create({
        fullName: {
            firstName, lastName
        },
        email,
        password: hashedPassword,
    })

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    res.cookie('token', token);

    return res.status(201).json({
        message: "user registered successfully",
        user: {
            fullName: {
                firstName, lastName
            },
            email
        }
    })
}

async function loginUser(req, res) {
    const { email, password } = req.body;

    const user = await userModel.findOne({
        email
    })
    if (!user) {
        return res.status(409).json({
            message: "Invalid email or password"
        })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
        return res.status(409).json({
            message: "Invalid password",
        })
    }

    const token = jwt.sign({ id: user._id },process.env.JWT_SECRET);
    res.cookie('token',token);

    try {
        const chatModel = require('../models/chat.model');
        // Find latest temp chat for this user
        const existingTemp = await chatModel.findOne({ user: user._id, isTemp: true }).sort({ createdAt: -1 });
        if (!existingTemp) {
            await chatModel.create({ user: user._id, title: 'Temp', isTemp: true });
        } else {
            // Ensure it's visible at top and fresh
            await chatModel.updateOne({ _id: existingTemp._id }, { $set: { lastActivity: new Date(), updatedAt: new Date() } });
        }
        // Optional: clean up any older temp chats that are unused (0 messages)
        const olderTemps = await chatModel.find({ user: user._id, isTemp: true }).sort({ createdAt: -1 });
        if (olderTemps.length > 1) {
            const keepId = String(olderTemps[0]._id);
            const candidateIds = olderTemps.slice(1).map(c => c._id);
            if (candidateIds.length) {
                const messageModel = require('../models/message.model');
                const counts = await messageModel.aggregate([
                    { $match: { chat: { $in: candidateIds } } },
                    { $group: { _id: '$chat', count: { $sum: 1 } } }
                ]);
                const usedSet = new Set(counts.map(c => String(c._id)));
                const toDelete = candidateIds.filter(id => !usedSet.has(String(id)) && String(id) !== keepId);
                if (toDelete.length) {
                    await chatModel.deleteMany({ _id: { $in: toDelete } });
                }
            }
        }
    } catch (e) {
        // Non-blocking: failure to create temp chat should not block login
        console.warn('Temp chat creation failed on login:', e && (e.message || e));
    }

    return res.status(200).json({
        message: "Loggin successfull",
        user:{
            fullName: user.fullName,
            email: user.email,
            id: user._id
        }
    })
}

async function logout(req, res) {
    res.clearCookie('token');
    return res.status(200).json({
        message: 'Logged out successfully'
    });
}

module.exports = {
    registerUser,
    loginUser,
    logout
}