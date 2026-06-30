	.globl	.ne
	.globl	outchar
	.globl	main
	.module	stmt_two_arg_local_ne_helper.i
	.area	_CODE
main:
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#67
	ld	hl,#0
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#68
	push	hl
	call	checkpair
	pop	bc
	pop	bc
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#77
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	jp	.3
.2:
	ld	hl,#88
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
.3:
	inc	sp
	ret
checkpair:
	ld	hl,#4
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#4
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	pop	de
	call	.ne
	ret
	.area	_BSS
