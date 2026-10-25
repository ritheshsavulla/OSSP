/**
 * Address Representation and Bitwise Decomposition Utility
 * Handles conversion between Hex, Binary, Decimal, and logical address decomposition
 * into Virtual Page Number (VPN), Page Directory (P1), Page Table (P2), and Offset.
 */

export class AddressDecoder {
  constructor(config = {}) {
    this.updateConfig(config);
  }

  updateConfig({
    addressBits = 16,
    pageSize = 1024, // bytes
    pagingType = 'single', // 'single', 'two-level', 'inverted'
    outerBits = 3, // For two-level: P1 bits (e.g. 3 bits = 8 directory entries)
  } = {}) {
    this.addressBits = addressBits;
    this.pageSize = pageSize;
    this.pagingType = pagingType;
    this.offsetBits = Math.round(Math.log2(pageSize));
    this.vpnBits = addressBits - this.offsetBits;
    this.numVirtualPages = 1 << this.vpnBits;
    this.maxAddress = (1 << addressBits) - 1;

    // For two-level paging
    if (this.vpnBits > 1) {
      this.outerBits = Math.min(outerBits, Math.floor(this.vpnBits / 2)) || 1;
      this.innerBits = this.vpnBits - this.outerBits;
    } else {
      this.outerBits = 1;
      this.innerBits = 0;
    }
  }

  /**
   * Parse input address string (supports '0x1A40', '1A40', binary '0b...', or decimal '6720')
   */
  parseAddress(input) {
    if (typeof input === 'number') {
      return Math.floor(input) & this.maxAddress;
    }
    if (typeof input !== 'string') return 0;

    let clean = input.trim().toLowerCase();
    let val = 0;

    if (clean.startsWith('0x')) {
      val = parseInt(clean.slice(2), 16);
    } else if (clean.startsWith('0b')) {
      val = parseInt(clean.slice(2), 2);
    } else if (/^[0-9a-f]+$/i.test(clean) && (clean.length > 3 || /[a-f]/i.test(clean))) {
      // Hex without 0x
      val = parseInt(clean, 16);
    } else {
      val = parseInt(clean, 10);
    }

    if (isNaN(val)) val = 0;
    return val & this.maxAddress;
  }

  /**
   * Decompose logical virtual address into components
   */
  decompose(logicalAddress) {
    const address = this.parseAddress(logicalAddress);
    const offsetMask = (1 << this.offsetBits) - 1;
    const offset = address & offsetMask;
    const vpn = (address >>> this.offsetBits) & ((1 << this.vpnBits) - 1);

    // Two-level decomposition
    const innerMask = (1 << this.innerBits) - 1;
    const innerIndex = vpn & innerMask; // P2
    const outerIndex = (vpn >>> this.innerBits) & ((1 << this.outerBits) - 1); // P1

    return {
      raw: address,
      hex: '0x' + address.toString(16).toUpperCase().padStart(Math.ceil(this.addressBits / 4), '0'),
      decimal: address,
      binary: address.toString(2).padStart(this.addressBits, '0'),
      offset,
      offsetHex: '0x' + offset.toString(16).toUpperCase().padStart(Math.ceil(this.offsetBits / 4), '0'),
      offsetBinary: offset.toString(2).padStart(this.offsetBits, '0'),
      vpn,
      vpnHex: '0x' + vpn.toString(16).toUpperCase().padStart(Math.ceil(this.vpnBits / 4), '0'),
      vpnBinary: vpn.toString(2).padStart(this.vpnBits, '0'),
      // Two-level fields
      outerIndex, // P1
      outerBinary: outerIndex.toString(2).padStart(this.outerBits, '0'),
      innerIndex, // P2
      innerBinary: innerIndex.toString(2).padStart(this.innerBits, '0'),
      offsetBits: this.offsetBits,
      vpnBits: this.vpnBits,
      outerBits: this.outerBits,
      innerBits: this.innerBits,
    };
  }

  /**
   * Assemble Physical Address given Frame Number and Offset
   */
  assemblePhysicalAddress(frameNumber, offset, frameBits = null) {
    const frame = frameNumber || 0;
    const cleanOffset = offset & ((1 << this.offsetBits) - 1);
    const physicalAddress = (frame << this.offsetBits) | cleanOffset;
    const totalBits = frameBits ? frameBits + this.offsetBits : this.addressBits;

    return {
      raw: physicalAddress,
      hex: '0x' + physicalAddress.toString(16).toUpperCase().padStart(Math.ceil(totalBits / 4), '0'),
      decimal: physicalAddress,
      binary: physicalAddress.toString(2).padStart(totalBits, '0'),
      frameNumber: frame,
      offset: cleanOffset,
    };
  }
}
