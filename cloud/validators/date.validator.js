function validateDates(startDate, endDate) {
    const errors = {};

    function parseDate(date) {
        if (date instanceof Date && !isNaN(date)) {
            return date;
        }
        if (typeof date === "string") {
            const parsedDate = new Date(date);
            if (!isNaN(parsedDate)) {
                return parsedDate;
            }
        }
        return null;
    }

    const start = parseDate(startDate);
    const end = parseDate(endDate);

    if (!start) {
        errors.startDate = "Invalid or missing start date";
    }

    if (!end) {
        errors.endDate = "Invalid or missing end date";
    }

    if (start && end && end < start) {
        errors.dateRange = "End date must be greater than or equal to start date";
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}


module.exports = {
    validateDates
};