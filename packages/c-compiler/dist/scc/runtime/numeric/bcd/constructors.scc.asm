; BCD v1: sign + 8 packed decimal bytes (16 digits, scale=4).
; All scratch in registers/stack; preserve IX, never use heap.
	.globl mz80_bcd_v1_from_int
	.area _CODE
mz80_bcd_v1_from_int:
	ld hl,#4
	add hl,sp
	ld e,(hl)
	inc hl
	ld d,(hl)
	ld a,d
	or e
	jp z,mz80_bcd_invalid
	ld hl,#2
	add hl,sp
	ld a,(hl)
	inc hl
	ld h,(hl)
	ld l,a
	xor a
	bit 7,h
	jp z,mz80_bcd_sign
	xor a
	sub l
	ld l,a
	ld a,#0
	sbc a,h
	ld h,a
	ld a,#1
mz80_bcd_sign:
	ld (de),a
	inc de
	ld b,#8
	xor a
mz80_bcd_clear:
	ld (de),a
	inc de
	djnz mz80_bcd_clear
	dec de
	dec de
	dec de
	push ix
mz80_bcd_pair:
	call mz80_bcd_digit
	ld (de),a
	ld a,h
	or l
	jp z,mz80_bcd_done
	call mz80_bcd_digit
	add a,a
	add a,a
	add a,a
	add a,a
	ld c,a
	ld a,(de)
	or c
	ld (de),a
	dec de
	ld a,h
	or l
	jp nz,mz80_bcd_pair
mz80_bcd_done:
	pop ix
	ld hl,#0
	ret
mz80_bcd_digit:
	ld ix,#0
	ld bc,#10
mz80_bcd_div10:
	or a
	sbc hl,bc
	jp c,mz80_bcd_remainder
	inc ix
	jp mz80_bcd_div10
mz80_bcd_remainder:
	add hl,bc
	ld a,l
	push ix
	pop hl
	ret
mz80_bcd_invalid:
	ld hl,#3
	ret
