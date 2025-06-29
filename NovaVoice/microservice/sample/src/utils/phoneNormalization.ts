// Phone Number Normalization Utility for NovaVoice Microservice
// Ensures consistent phone number formatting for Vonage API calls

export interface PhoneValidationResult {
  isValid: boolean;
  normalized?: string;
  e164?: string;
  display?: string;
  error?: string;
}

export class PhoneNormalizationService {
  private static readonly STANDARD_FORMAT = /^\+1 \(\d{3}\) \d{3}-\d{4}$/;
  
  /**
   * Normalize a phone number to standard format: +1 (XXX) XXX-XXXX
   */
  static normalize(phoneNumber: string): PhoneValidationResult {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return {
        isValid: false,
        error: 'Phone number is required and must be a string'
      };
    }
    
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Handle different digit counts
    let tenDigits: string;
    
    switch (digits.length) {
      case 10:
        // US number without country code: 5169380383
        tenDigits = digits;
        break;
      case 11:
        // US number with country code: 15169380383
        if (digits.startsWith('1')) {
          tenDigits = digits.substring(1);
        } else {
          return {
            isValid: false,
            error: '11-digit number must start with 1 for US numbers'
          };
        }
        break;
      case 7:
        return {
          isValid: false,
          error: 'Local number (7 digits) requires area code'
        };
      default:
        return {
          isValid: false,
          error: `Invalid phone number length: ${digits.length} digits`
        };
    }
    
    // Validate area code (first 3 digits)
    const areaCode = tenDigits.substring(0, 3);
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
      return {
        isValid: false,
        error: `Invalid area code: ${areaCode}`
      };
    }
    
    // Validate exchange (next 3 digits)
    const exchange = tenDigits.substring(3, 6);
    if (exchange.startsWith('0') || exchange.startsWith('1')) {
      return {
        isValid: false,
        error: `Invalid exchange: ${exchange}`
      };
    }
    
    // Format the number
    const normalized = `+1 (${areaCode}) ${exchange}-${tenDigits.substring(6)}`;
    const e164 = `+1${tenDigits}`;
    
    return {
      isValid: true,
      normalized,
      e164,
      display: normalized
    };
  }
  
  /**
   * Check if phone number is already in standard format
   */
  static isNormalized(phoneNumber: string): boolean {
    return this.STANDARD_FORMAT.test(phoneNumber);
  }
  
  /**
   * Convert normalized phone to E.164 format for API calls
   */
  static toE164(phoneNumber: string): string | null {
    const result = this.normalize(phoneNumber);
    return result.isValid ? result.e164! : null;
  }
  
  /**
   * Convert any phone format to digits only (for API compatibility)
   */
  static toDigitsOnly(phoneNumber: string): string | null {
    const result = this.normalize(phoneNumber);
    if (!result.isValid) return null;
    
    // Return just the 10 digits without country code
    return result.e164!.substring(2);
  }
  
  /**
   * Validate and prepare phone number for Vonage API
   */
  static prepareForVonage(phoneNumber: string): PhoneValidationResult {
    const result = this.normalize(phoneNumber);
    
    if (!result.isValid) {
      return result;
    }
    
    // For Vonage, we use E.164 format without the +
    const vonageFormat = result.e164!.substring(1); // Remove the +
    
    return {
      ...result,
      e164: vonageFormat // Vonage expects without +
    };
  }
  
  /**
   * Bulk validation for multiple phone numbers
   */
  static validateBatch(phoneNumbers: string[]): PhoneValidationResult[] {
    return phoneNumbers.map(phone => this.normalize(phone));
  }
  
  /**
   * Get phone number statistics
   */
  static getStats(phoneNumbers: string[]): {
    total: number;
    valid: number;
    invalid: number;
    alreadyNormalized: number;
    errors: string[];
  } {
    const results = this.validateBatch(phoneNumbers);
    const errors: string[] = [];
    
    let valid = 0;
    let alreadyNormalized = 0;
    
    results.forEach((result, index) => {
      if (result.isValid) {
        valid++;
        if (this.isNormalized(phoneNumbers[index])) {
          alreadyNormalized++;
        }
      } else {
        errors.push(`Phone ${index + 1}: ${result.error}`);
      }
    });
    
    return {
      total: phoneNumbers.length,
      valid,
      invalid: phoneNumbers.length - valid,
      alreadyNormalized,
      errors
    };
  }
}

// Export convenience functions
export const normalizePhone = PhoneNormalizationService.normalize;
export const phoneToE164 = PhoneNormalizationService.toE164;
export const phoneToVonage = PhoneNormalizationService.prepareForVonage;
export const isNormalizedPhone = PhoneNormalizationService.isNormalized;