function validateBody(validator) {
  return (req, res, next) => {
    try {
      const errorMessage = validator(req.body || {});
      if (errorMessage) {
        return res.status(400).json({ error: errorMessage });
      }
      return next();
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Invalid request body' });
    }
  };
}

module.exports = {
  validateBody
};
