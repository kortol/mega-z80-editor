abs:
	ld	hl,#2
	add	hl,sp
	call	.gint
	bit	7,h
	ret	z
	ld	a,l
	cpl
	ld	l,a
	ld	a,h
	cpl
	ld	h,a
	inc	hl
	ret

; int atoi(char *text).  This intentionally small C89 subset accepts leading
; ASCII space/tab, an optional sign, then decimal digits.
atoi:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_atoi_pointer),hl
	ld	bc,#0
	ld	a,#0
	ld	(mz80_full_atoi_negative),a
.atoi_space:
	ld	hl,(mz80_full_atoi_pointer)
	ld	a,(hl)
	cp	#32
	jr	z,.atoi_skip
	cp	#9
	jr	nz,.atoi_sign
.atoi_skip:
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
	jr	.atoi_space
.atoi_sign:
	cp	#45
	jr	nz,.atoi_plus
	ld	a,#1
	ld	(mz80_full_atoi_negative),a
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
	jr	.atoi_digit
.atoi_plus:
	cp	#43
	jr	nz,.atoi_digit
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
.atoi_digit:
	ld	hl,(mz80_full_atoi_pointer)
	ld	a,(hl)
	sub	#48
	jr	c,.atoi_done
	cp	#10
	jr	nc,.atoi_done
	ld	e,a
	ld	d,#0
	push	de
	ld	h,b
	ld	l,c
	add	hl,hl
	add	hl,hl
	add	hl,bc
	add	hl,hl
	pop	de
	add	hl,de
	ld	b,h
	ld	c,l
	ld	hl,(mz80_full_atoi_pointer)
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
	jr	.atoi_digit
.atoi_done:
	ld	h,b
	ld	l,c
	ld	a,(mz80_full_atoi_negative)
	or	a
	ret	z
	ld	a,l
	cpl
	ld	l,a
	ld	a,h
	cpl
	ld	h,a
	inc	hl
	ret
mz80_full_atoi_negative:
	.db	0
mz80_full_atoi_pointer:
	.dw	0

; assert() is the one supported function-like bundled-header macro.  A false
; condition exits through the selected platform CRT; true evaluates to zero.
__mz80_assert:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	a,h
	or	l
	jr	nz,.assert_ok
	ld	hl,#1
	call	exit
.assert_ok:
	ld	hl,#0
	ret

; int rand(void) / void srand(int).  This is a deterministic 15-bit LCG for
; the fixed Z80 ABI, not a cryptographic random source.
rand:
	ld	hl,(mz80_full_rand_seed)
	ld	d,h
	ld	e,l
	add	hl,hl
	add	hl,hl
	add	hl,de
	inc	hl
	res	7,h
	ld	(mz80_full_rand_seed),hl
	ret
srand:
	ld	hl,#2
	add	hl,sp
	call	.gint
	res	7,h
	ld	(mz80_full_rand_seed),hl
	ret
mz80_full_rand_seed:
	.dw	1
