printf:
	push	ix
	push	iy
	ld	hl,#6
	add	hl,sp
	call	.gint
	push	hl
	pop	iy
	ld	hl,#8
	add	hl,sp
	push	hl
	pop	ix
	ld	de,#0
	call	mz80_full_vformat
	pop	iy
	pop	ix
	ld	hl,#0
	ret

sprintf:
	push	ix
	push	iy
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	push	de
	ld	hl,#10
	add	hl,sp
	call	.gint
	push	hl
	pop	iy
	ld	hl,#12
	add	hl,sp
	push	hl
	pop	ix
	call	mz80_full_vformat
	xor	a
	ld	(de),a
	pop	hl
	pop	iy
	pop	ix
	ret

mz80_full_vformat:
mz80_full_format_loop:
	push	iy
	pop	hl
	ld	a,(hl)
	inc	iy
	or	a
	ret	z
	cp	#37
	jr	z,.format_percent
	call	mz80_full_emit
	jp	mz80_full_format_loop
.format_percent:
	push	iy
	pop	hl
	ld	a,(hl)
	inc	iy
	cp	#37
	jr	z,.format_emit
	cp	#99
	jr	z,.format_char
	cp	#115
	jr	z,.format_string
	cp	#100
	jr	z,.format_signed
	cp	#117
	jr	z,.format_unsigned
	cp	#120
	jr	z,.format_hex_lower
	cp	#88
	jr	z,.format_hex_upper
	cp	#112
	jr	z,.format_pointer
	ld	a,#63
	jr	.format_emit
.format_char:
	call	mz80_full_next_arg
	ld	a,l
	jr	.format_emit
.format_string:
	call	mz80_full_next_arg
.format_string_loop:
	ld	a,(hl)
	inc	hl
	or	a
	jr	z,mz80_full_format_loop
	push	hl
	call	mz80_full_emit
	pop	hl
	jr	.format_string_loop
.format_signed:
	call	mz80_full_next_arg
	call	mz80_full_emit_signed
	jp	mz80_full_format_loop
.format_unsigned:
	call	mz80_full_next_arg
	call	mz80_full_emit_unsigned
	jp	mz80_full_format_loop
.format_hex_lower:
	call	mz80_full_next_arg
	call	mz80_full_emit_hex_lower
	jp	mz80_full_format_loop
.format_hex_upper:
	call	mz80_full_next_arg
	call	mz80_full_emit_hex_upper
	jp	mz80_full_format_loop
.format_pointer:
	call	mz80_full_next_arg
	push	hl
	ld	a,#48
	call	mz80_full_emit
	ld	a,#120
	call	mz80_full_emit
	pop	hl
	ld	a,#97
	ld	(mz80_full_hex_alpha),a
	call	mz80_full_emit_hex_fixed
	jp	mz80_full_format_loop
.format_emit:
	call	mz80_full_emit
	jp	mz80_full_format_loop

mz80_full_next_arg:
	push	ix
	pop	hl
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	inc	ix
	inc	ix
	ret

; Emit A to DE when sprintf is active, otherwise call the platform putchar.
mz80_full_emit:
	push	af
	ld	a,d
	or	e
	jr	z,.emit_console
	pop	af
	ld	(de),a
	inc	de
	ret
.emit_console:
	pop	af
	push	de
	ld	l,a
	ld	h,#0
	push	hl
	call	putchar
	pop	bc
	pop	de
	ret

; HL is an unsigned 16-bit integer. Binary long division keeps the formatter
; bounded for every 16-bit value (including signed -1 after negation).
mz80_full_emit_unsigned:
	push	de
	ld	de,#0
	ld	c,#0
	ld	b,#16
.unsigned_divide:
	add	hl,hl
	rl	c
	ld	a,c
	cp	#10
	jr	c,.unsigned_quotient_zero
	sub	#10
	ld	c,a
	scf
	jr	.unsigned_quotient_bit
.unsigned_quotient_zero:
	or	a
.unsigned_quotient_bit:
	rl	e
	rl	d
	djnz	.unsigned_divide
	ld	h,d
	ld	l,e
	pop	de
	push	bc
	ld	a,h
	or	l
	jr	z,.unsigned_emit_remainder
	call	mz80_full_emit_unsigned
.unsigned_emit_remainder:
	pop	bc
	ld	a,c
	add	a,#48
	call	mz80_full_emit
	ret

mz80_full_emit_signed:
	bit	7,h
	jr	z,.signed_positive
	push	hl
	ld	a,#45
	call	mz80_full_emit
	pop	hl
	xor	a
	sub	l
	ld	l,a
	ld	a,#0
	sbc	a,h
	ld	h,a
.signed_positive:
	call	mz80_full_emit_unsigned
	ret

; Hexadecimal output uses the same quotient/remainder recursion as decimal.
; The two entry points keep case selection out of the public formatter state.
mz80_full_emit_hex_lower:
	ld	a,#97
	jp	mz80_full_emit_hex

mz80_full_emit_hex_upper:
	ld	a,#65
mz80_full_emit_hex:
	ld	(mz80_full_hex_alpha),a
	jr	mz80_full_emit_hex_recurse

mz80_full_emit_hex_recurse:
	push	de
	ld	bc,#0
	ld	de,#16
.hex_divide:
	ld	a,h
	or	a
	jr	nz,.hex_subtract
	ld	a,l
	cp	#16
	jr	c,.hex_remainder
.hex_subtract:
	or	a
	sbc	hl,de
	inc	bc
	jr	.hex_divide
.hex_remainder:
	pop	de
	push	hl
	ld	h,b
	ld	l,c
	ld	a,h
	or	l
	jr	z,.hex_emit_remainder
	call	mz80_full_emit_hex_recurse
.hex_emit_remainder:
	pop	hl
	ld	a,l
	call	mz80_full_emit_hex_digit
	ret

mz80_full_emit_hex_digit:
	cp	#10
	jr	c,.hex_digit
	sub	#10
	ld	b,a
	ld	a,(mz80_full_hex_alpha)
	add	a,b
	jr	.hex_emit
.hex_digit:
	add	a,#48
.hex_emit:
	call	mz80_full_emit
	ret

; Pointer output is fixed-width hexadecimal. This avoids repeated subtraction
; over stack addresses while keeping %x/%X compact for ordinary values.
mz80_full_emit_hex_fixed:
	push	hl
	ld	a,h
	rrca
	rrca
	rrca
	rrca
	and	#15
	call	mz80_full_emit_hex_digit
	pop	hl
	push	hl
	ld	a,h
	and	#15
	call	mz80_full_emit_hex_digit
	pop	hl
	push	hl
	ld	a,l
	rrca
	rrca
	rrca
	rrca
	and	#15
	call	mz80_full_emit_hex_digit
	pop	hl
	ld	a,l
	and	#15
	call	mz80_full_emit_hex_digit
	ret

mz80_full_hex_alpha:
	.db	97
