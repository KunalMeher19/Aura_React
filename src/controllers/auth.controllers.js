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

    return res.status(200).json({
        message: "Loggin successfull",
        user:{
            fullName: user.fullName,
            email: user.email,
            id: user._id
        }
    })
}

module.exports = {
    registerUser,
    loginUser
}