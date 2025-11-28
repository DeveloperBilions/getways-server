const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
];
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];
const VALID_CATEGORIES = [
  "redeem",
  "recharge",
  "wallet",
  "login",
  "password",
  "others",
];

function validateTicket(ticketData) {
  const errors = {};

  // Validate category
  const categoryValidation = validateCategory(ticketData.category);
  if (!categoryValidation.isValid) {
    errors.category = categoryValidation.error;
  }

  // Validate description
  const descriptionValidation = validateDescription(ticketData.description);
  if (!descriptionValidation.isValid) {
    errors.description = descriptionValidation.error;
  }

  // Validate attachments array if provided
  if (ticketData.attachments && Array.isArray(ticketData.attachments)) {
    const attachmentsValidation = validateAttachments(ticketData.attachments);
    if (!attachmentsValidation.isValid) {
      errors.attachments = attachmentsValidation.error;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors: Object.values(errors).join("\n"),
  };
}

function validateCategory(category) {
  if (!category) {
    return {
      isValid: false,
      error: "Category is required",
    };
  }

  if (!VALID_CATEGORIES.includes(category.toLowerCase())) {
    return {
      isValid: false,
      error: "Invalid category selected",
    };
  }

  return {
    isValid: true,
    error: null,
  };
}

function validateDescription(description) {
  if (!description || !description.trim()) {
    return {
      isValid: false,
      error: "Description is required",
    };
  }

  const trimmedDescription = description.trim();

  if (trimmedDescription.length < 10) {
    return {
      isValid: false,
      error: "Description must be at least 10 characters",
    };
  }

  if (trimmedDescription.length > 1000) {
    return {
      isValid: false,
      error: "Description must not exceed 1000 characters",
    };
  }

  return {
    isValid: true,
    error: null,
  };
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return {
      isValid: false,
      error: "Attachments must be an array",
    };
  }

  for (let i = 0; i < attachments.length; i++) {
    const file = attachments[i];
    const fileValidation = validateFile(file, i);
    
    if (!fileValidation.isValid) {
      return fileValidation;
    }
  }

  return {
    isValid: true,
    error: null,
  };
}

function validateFile(file, index = 0) {
  if (!file) {
    return {
      isValid: false,
      error: `File at index ${index} is missing`,
    };
  }

  // Check required fields
  if (!file.fileName) {
    return {
      isValid: false,
      error: `File at index ${index}: fileName is required`,
    };
  }

  if (!file.fileBase64) {
    return {
      isValid: false,
      error: `File at index ${index}: fileBase64 is required`,
    };
  }

  if (!file.fileType) {
    return {
      isValid: false,
      error: `File at index ${index}: fileType is required`,
    };
  }

  if (!file.fileSize) {
    return {
      isValid: false,
      error: `File at index ${index}: fileSize is required`,
    };
  }

  // Check file size
  if (file.fileSize > MAX_FILE_SIZE) {
    return {
      isValid: false,
      error: `File "${file.fileName}": size must be less than 25MB`,
    };
  }

  // Check file type
  const isImage = ALLOWED_IMAGE_TYPES.includes(file.fileType);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.fileType);

  if (!isImage && !isVideo) {
    return {
      isValid: false,
      error: `File "${file.fileName}": only image files (JPEG, PNG, GIF, WebP, BMP) and video files (MP4, MPEG, MOV, AVI, WebM) are allowed`,
    };
  }

  return {
    isValid: true,
    error: null,
  };
}

module.exports = {
  validateTicket,
  validateCategory,
  validateDescription,
  validateAttachments,
  validateFile,
};
