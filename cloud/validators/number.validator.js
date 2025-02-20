function validatePositiveNumber(value) {
    if (!/^\d+(\.\d+)?$/.test(value)) {
        return { isValid: false, errors: "Value must contain only Positive numbers" };
    }
    value = Number(value);

    if (value <= 0) {
        return { isValid: false, errors: "Number must be greater than 0" };
    }

    return { isValid: true };
}

module.exports = {
    validatePositiveNumber
};