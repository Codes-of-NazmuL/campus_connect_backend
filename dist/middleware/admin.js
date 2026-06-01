"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRoles = exports.requireAdmin = void 0;
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};
exports.requireAdmin = requireAdmin;
const requireRoles = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
        }
        next();
    };
};
exports.requireRoles = requireRoles;
