; Fixed v1 constructors: packed little-endian Q8.8 and Q16.16.
; Stack ABI, no heap / mutable global storage; IX/IY untouched.
	.globl mz80_q8_v1_from_int
	.globl mz80_q16_v1_from_int
	.area _CODE
mz80_q8_v1_from_int:
	ld hl,#4
	add hl,sp
	ld e,(hl)
	inc hl
	ld d,(hl)
	ld a,d
	or e
	jp z,mz80_fixed_invalid
	ld hl,#2
	add hl,sp
	ld c,(hl)
	inc hl
	ld b,(hl)
	bit 7,c
	jp nz,mz80_fixed_negative
	ld a,b
	or a
	jp nz,mz80_fixed_overflow
	jp mz80_fixed_q8_store
mz80_fixed_negative:
	ld a,b
	cp #255
	jp nz,mz80_fixed_overflow
mz80_fixed_q8_store:
	xor a
	ld (de),a
	inc de
	ld a,c
	ld (de),a
	ld hl,#0
	ret
mz80_q16_v1_from_int:
	ld hl,#4
	add hl,sp
	ld e,(hl)
	inc hl
	ld d,(hl)
	ld a,d
	or e
	jp z,mz80_fixed_invalid
	ld hl,#2
	add hl,sp
	ld c,(hl)
	inc hl
	ld b,(hl)
	xor a
	ld (de),a
	inc de
	ld (de),a
	inc de
	ld a,c
	ld (de),a
	inc de
	ld a,b
	ld (de),a
	ld hl,#0
	ret
mz80_fixed_invalid:
	ld hl,#3
	ret
mz80_fixed_overflow:
	ld hl,#1
	ret
