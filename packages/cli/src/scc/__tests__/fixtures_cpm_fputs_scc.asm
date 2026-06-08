	.globl	fputs
	.globl	main
	.module	cpm_fputs.i
	.area	_CODE
main:
	ld	hl,#1
	push	hl
	ld	hl,#.0+0
	push	hl
	call	fputs
	pop	bc
	pop	bc
	ret
	.area	_DATA
.0:	.ascii	"FPUTS OK$"
	.area	_BSS
