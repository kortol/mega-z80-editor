	.globl	.ne
	.globl	outchar
	.globl	main
	.module	stmt_two_arg_ne_helper.i
	.area	_CODE
main:
	ld	hl,#65
	push	hl
	ld	hl,#66
	push	hl
	call	checkpair
	pop	bc
	pop	bc
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#68
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
.2:
	ld	hl,#88
	push	hl
	ld	a,#1
	call	outchar
	pop	bc
	ret
checkpair:
	ld	hl,#4
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	push	hl
	ld	hl,#2
	add	hl,sp
	ld	l,(hl)
	ld	h,#0
	pop	de
	call	.ne
	ret
	.area	_BSS
