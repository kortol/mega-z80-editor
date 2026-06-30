	.globl	.gt
	.globl	outchar
	.globl	main
	.module	stmt_local_int_arg_int_gt_helper.i
	.area	_CODE
main:
	ld	hl,#90
	push	hl
	call	checkmixgt
	pop	bc
	ld	a,h
	or	l
	jp	z,.2
	ld	hl,#84
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
	ret
checkmixgt:
	dec	sp
	dec	sp
	ld	hl,#0
	add	hl,sp
	ld	(hl),#91
	inc	hl
	ld	(hl),#0
	ld	hl,#0
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	push	hl
	ld	hl,#6
	add	hl,sp
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	pop	de
	call	.gt
	inc	sp
	inc	sp
	ret
	.area	_BSS
