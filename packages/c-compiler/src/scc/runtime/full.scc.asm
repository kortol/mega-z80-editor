; Profile supplement shared by all bundled full runtimes.  Entry arguments use
; the current TypeScript SCC non-variadic ABI (first argument farthest from SP).
	.globl	memcmp
	.globl	memcpy
	.globl	memset
	.globl	strcmp
	.globl	strcpy
	.globl	strlen
	.globl	isalpha
	.globl	isdigit
	.globl	islower
	.globl	isspace
	.globl	isupper
	.globl	tolower
	.globl	toupper
	.globl	printf
	.globl	sprintf
	.globl	mz80_full_memset_value
	.globl	mz80_full_isalpha_a
	.globl	mz80_full_vformat
	.globl	mz80_full_next_arg
	.globl	mz80_full_emit
	.globl	mz80_full_emit_unsigned
	.globl	mz80_full_emit_signed
	.globl	mz80_full_emit_hex_lower
	.globl	mz80_full_emit_hex_upper
	.globl	mz80_full_emit_hex
	.globl	mz80_full_emit_hex_recurse
	.globl	mz80_full_emit_hex_fixed
	.globl	mz80_full_emit_hex_digit
	.globl	mz80_full_format_loop
	.globl	mz80_full_hex_alpha
	.area	_CODE

strlen:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	bc,#0
.strlen_loop:
	ld	a,(hl)
	or	a
	jr	z,.strlen_done
	inc	hl
	inc	bc
	jr	.strlen_loop
.strlen_done:
	ld	h,b
	ld	l,c
	ret

memcpy:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#4
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#8
	add	hl,sp
	call	.gint
	ex	de,hl
	pop	hl
	push	de
.memcpy_loop:
	ld	a,b
	or	c
	jr	z,.memcpy_done
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	bc
	jr	.memcpy_loop
.memcpy_done:
	pop	hl
	ret

memset:
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#4
	add	hl,sp
	call	.gchar
	ld	a,l
	ld	(mz80_full_memset_value),a
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	push	de
.memset_loop:
	ld	a,b
	or	c
	jr	z,.memset_done
	ld	a,(mz80_full_memset_value)
	ld	(de),a
	inc	de
	dec	bc
	jr	.memset_loop
.memset_done:
	pop	hl
	ret
mz80_full_memset_value:
	.db	0

strcmp:
	ld	hl,#4
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#2
	add	hl,sp
	call	.gint
.strcmp_loop:
	ld	a,(hl)
	ld	c,a
	ld	a,(de)
	sub	c
	jr	nz,.strcmp_done
	ld	a,c
	or	a
	jr	z,.strcmp_done
	inc	de
	inc	hl
	jr	.strcmp_loop
.strcmp_done:
	ld	l,a
	bit	7,a
	jr	z,.strcmp_positive
	ld	h,#255
	ret
.strcmp_positive:
	ld	h,#0
	ret

memcmp:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#4
	add	hl,sp
	call	.gint
.memcmp_loop:
	ld	a,b
	or	c
	jr	z,.memcmp_equal
	push	bc
	ld	a,(hl)
	ld	b,a
	ld	a,(de)
	sub	b
	pop	bc
	jr	nz,.memcmp_done
	inc	de
	inc	hl
	dec	bc
	jr	.memcmp_loop
.memcmp_equal:
	xor	a
.memcmp_done:
	ld	l,a
	bit	7,a
	jr	z,.memcmp_positive
	ld	h,#255
	ret
.memcmp_positive:
	ld	h,#0
	ret

strcpy:
	ld	hl,#4
	add	hl,sp
	call	.gint
	ex	de,hl
	push	de
	ld	hl,#4
	add	hl,sp
	call	.gint
.strcpy_loop:
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	or	a
	jr	nz,.strcpy_loop
	pop	hl
	ret

isalpha:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	call	mz80_full_isalpha_a
	ret
isdigit:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.false
	cp	#58
	jr	nc,.false
	jr	.true
islower:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#97
	jr	c,.false
	cp	#123
	jr	nc,.false
	jr	.true
isupper:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#65
	jr	c,.false
	cp	#91
	jr	nc,.false
	jr	.true
isspace:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	z,.true
	cp	#9
	jr	c,.false
	cp	#14
	jr	nc,.false
	jr	.true
tolower:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#65
	jr	c,.char
	cp	#91
	jr	nc,.char
	add	a,#32
.char:
	ld	l,a
	ld	h,#0
	ret
toupper:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#97
	jr	c,.char
	cp	#123
	jr	nc,.char
	sub	#32
	jr	.char
mz80_full_isalpha_a:
	cp	#65
	jr	c,.alpha_lower
	cp	#91
	jr	c,.true
.alpha_lower:
	cp	#97
	jr	c,.false
	cp	#123
	jr	nc,.false
.true:
	ld	hl,#1
	ret
.false:
	ld	hl,#0
	ret

; printf and sprintf use the TS compiler's internal variadic ABI: slots are
; pushed right-to-left. IY is the format cursor, IX the next argument slot,
; and DE is the optional sprintf cursor (zero means console output).
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
